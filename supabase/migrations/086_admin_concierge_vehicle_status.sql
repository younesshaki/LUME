-- 086_admin_concierge_vehicle_status.sql
-- Fifth reviewed capability: publish, unpublish or archive one vehicle.
--
-- This closes a loop the concierge could already open but not act on. It can
-- surface vehicles with no photos (inventory.photo_gap) and stale stock
-- (inventory.aging), and the obvious next move for both is "take it off the
-- site" — which until now meant leaving the conversation for the vehicles
-- table. Archiving is also the single most common bulk action in the admin.
--
-- Follows 080/082/083 exactly: the command row is the idempotency boundary;
-- this function locks it, re-checks the operator's role inside the write
-- transaction, compare-and-swaps against the reviewed status so a concurrent
-- dashboard edit is never silently overwritten, and writes the receipt.
--
-- Two deliberate refusals, both enforced here rather than trusted from the
-- caller:
--
--  * 'sold' is never a target. The vehicles_status_check constraint requires
--    sold_at and sold_price to be set alongside it, so recording a sale is a
--    multi-field operation with revenue meaning — not something to infer from
--    one sentence.
--  * A vehicle that is already sold is never moved. Migration 040 protects
--    sold history from deletion; the same reasoning applies to quietly
--    unpublishing a recorded sale out from under the reporting that uses it.

alter table public.admin_concierge_commands
  drop constraint if exists admin_concierge_commands_capability_id_check;

alter table public.admin_concierge_commands
  add constraint admin_concierge_commands_capability_id_check
  check (capability_id in (
    'lead.status.update',
    'feed.run.enqueue',
    'lead.assign',
    'vehicle.price.update',
    'vehicle.status.update'
  ));

create or replace function public.execute_admin_concierge_vehicle_status_command(
  p_command_id uuid,
  p_tenant_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_command public.admin_concierge_commands%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_vehicle_id uuid;
  v_next_status text;
  v_expected_status text;
  v_label text;
  v_result jsonb;
begin
  select * into v_command
  from public.admin_concierge_commands command
  where command.id = p_command_id
    and command.tenant_id = p_tenant_id
    and command.actor_user_id = p_actor_user_id
    and command.capability_id = 'vehicle.status.update'
  for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;

  -- Authorization must hold inside the write transaction, not just at the
  -- route. Locking stops a concurrent demotion racing a reviewed command.
  perform 1 from public.tenant_members member
  where member.tenant_id = p_tenant_id
    and member.user_id = p_actor_user_id
    and member.role in ('owner', 'admin', 'editor')
  for update;
  if not found then
    update public.admin_concierge_commands command
    set status = 'failed', error = 'The operator no longer has edit access for this tenant.'
    where command.id = v_command.id;
    return jsonb_build_object('status', 'failed', 'error', 'The operator no longer has edit access for this tenant.');
  end if;

  if v_command.status = 'executed' then
    return jsonb_set(coalesce(v_command.result, jsonb_build_object('status','executed')), '{alreadyExecuted}', 'true'::jsonb);
  end if;
  if v_command.status <> 'pending' then
    return jsonb_build_object('status', v_command.status, 'error', coalesce(v_command.error, 'Command is no longer executable.'));
  end if;
  if v_command.expires_at <= now() then
    update public.admin_concierge_commands command
    set status = 'expired', error = 'Confirmation window expired.' where command.id = v_command.id;
    return jsonb_build_object('status', 'expired', 'error', 'Confirmation window expired.');
  end if;

  begin
    v_vehicle_id := (v_command.intent ->> 'vehicleId')::uuid;
  exception when others then
    v_vehicle_id := null;
  end;
  v_next_status := v_command.intent ->> 'status';
  v_expected_status := v_command.preview #>> '{vehicle,currentStatus}';
  v_label := coalesce(v_command.preview #>> '{vehicle,label}', 'the selected vehicle');

  if v_vehicle_id is null
    or v_next_status is null
    or v_expected_status is null
    or v_next_status not in ('draft', 'live', 'archived')
    or (v_command.preview #>> '{vehicle,id}') is distinct from v_vehicle_id::text then
    update public.admin_concierge_commands command
    set status = 'failed', error = 'Command payload is invalid.' where command.id = v_command.id;
    return jsonb_build_object('status', 'failed', 'error', 'Command payload is invalid.');
  end if;

  select * into v_vehicle from public.vehicles vehicle
  where vehicle.id = v_vehicle_id and vehicle.tenant_id = p_tenant_id for update;
  if not found then
    update public.admin_concierge_commands command
    set status = 'failed', error = 'The selected vehicle no longer exists.' where command.id = v_command.id;
    return jsonb_build_object('status', 'failed', 'error', 'The selected vehicle no longer exists.');
  end if;

  if v_vehicle.status = 'sold' or v_vehicle.sold_at is not null then
    update public.admin_concierge_commands command
    set status = 'failed', error = 'Sold vehicles keep their status. Change it from the vehicle page if this was a mistake.'
    where command.id = v_command.id;
    return jsonb_build_object('status', 'failed', 'error', 'Sold vehicles keep their status. Change it from the vehicle page if this was a mistake.');
  end if;

  -- Compare-and-swap: a concurrent dashboard edit must never be silently
  -- overwritten by a stale reviewed command.
  if v_vehicle.status is distinct from v_expected_status then
    update public.admin_concierge_commands command
    set status = 'failed', error = 'The vehicle status changed after this command was reviewed. Refresh and prepare a new command.'
    where command.id = v_command.id;
    return jsonb_build_object('status', 'stale', 'error', 'The vehicle status changed after this command was reviewed. Refresh and prepare a new command.');
  end if;

  update public.vehicles vehicle
  set status = v_next_status
  where vehicle.id = v_vehicle.id and vehicle.tenant_id = p_tenant_id;

  v_result := jsonb_build_object(
    'status', 'executed',
    'vehicleId', v_vehicle.id,
    'label', v_label,
    'previousStatus', v_vehicle.status,
    'nextStatus', v_next_status
  );
  update public.admin_concierge_commands command
  set status = 'executed', confirmed_at = now(), executed_at = now(), result = v_result, error = null
  where command.id = v_command.id;
  return v_result;
end;
$$;

revoke all on function public.execute_admin_concierge_vehicle_status_command(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.execute_admin_concierge_vehicle_status_command(uuid, uuid, uuid)
  to service_role;
