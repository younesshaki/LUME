-- 083_admin_concierge_vehicle_price.sql
-- Fourth reviewed capability: reprice one vehicle.
--
-- Repricing is the lever a dealer pulls most, and aging stock is exactly what
-- the concierge can already surface — so "reprice it" closes the loop from
-- insight to action.
--
-- Follows 080/082: the command row is the idempotency boundary; this function
-- locks it, re-checks the operator's role inside the write transaction,
-- compare-and-swaps against the reviewed price so a concurrent dashboard edit
-- is never silently overwritten, and writes the receipt. Migration 014's price
-- trigger records history automatically. Sold vehicles keep their frozen
-- price, matching the existing bulk-price rule.

alter table public.admin_concierge_commands
  drop constraint if exists admin_concierge_commands_capability_id_check;

alter table public.admin_concierge_commands
  add constraint admin_concierge_commands_capability_id_check
  check (capability_id in ('lead.status.update', 'feed.run.enqueue', 'lead.assign', 'vehicle.price.update'));

create or replace function public.execute_admin_concierge_vehicle_price_command(
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
  v_next_price integer;
  v_expected_price integer;
  v_label text;
  v_result jsonb;
begin
  select * into v_command
  from public.admin_concierge_commands command
  where command.id = p_command_id
    and command.tenant_id = p_tenant_id
    and command.actor_user_id = p_actor_user_id
    and command.capability_id = 'vehicle.price.update'
  for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;

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
    v_next_price := (v_command.intent ->> 'price')::integer;
    v_expected_price := (v_command.preview #>> '{vehicle,currentPrice}')::integer;
  exception when others then
    v_vehicle_id := null; v_next_price := null; v_expected_price := null;
  end;
  v_label := coalesce(v_command.preview #>> '{vehicle,label}', 'the selected vehicle');

  if v_vehicle_id is null or v_next_price is null or v_expected_price is null
    or v_next_price < 0 or v_next_price > 100000000
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

  -- Matches the bulk-price rule: a recorded sale freezes the price.
  if v_vehicle.sold_at is not null then
    update public.admin_concierge_commands command
    set status = 'failed', error = 'Sold vehicle prices are frozen.' where command.id = v_command.id;
    return jsonb_build_object('status', 'failed', 'error', 'Sold vehicle prices are frozen.');
  end if;

  if v_vehicle.price is distinct from v_expected_price then
    update public.admin_concierge_commands command
    set status = 'failed', error = 'The price changed after this command was reviewed. Refresh and prepare a new command.'
    where command.id = v_command.id;
    return jsonb_build_object('status', 'stale', 'error', 'The price changed after this command was reviewed. Refresh and prepare a new command.');
  end if;

  update public.vehicles vehicle
  set price = v_next_price
  where vehicle.id = v_vehicle.id and vehicle.tenant_id = p_tenant_id;

  v_result := jsonb_build_object('status','executed','vehicleId', v_vehicle.id,
    'label', v_label, 'previousPrice', v_vehicle.price, 'nextPrice', v_next_price);
  update public.admin_concierge_commands command
  set status = 'executed', confirmed_at = now(), executed_at = now(), result = v_result, error = null
  where command.id = v_command.id;
  return v_result;
end;
$$;

revoke all on function public.execute_admin_concierge_vehicle_price_command(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.execute_admin_concierge_vehicle_price_command(uuid, uuid, uuid)
  to service_role;
