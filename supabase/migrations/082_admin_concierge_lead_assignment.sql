-- 082_admin_concierge_lead_assignment.sql
-- Third reviewed admin-concierge capability: assign one lead to one teammate.
--
-- Follows migration 080 exactly: the command row is the immutable reviewed
-- plan and the idempotency boundary, and this SECURITY DEFINER function locks
-- it, re-checks authorization inside the write transaction, applies a
-- compare-and-swap against the reviewed preview, records a lead activity, and
-- writes the verified receipt — all in one transaction.
--
-- The assignee is resolved to a user id by trusted LUME code before a command
-- is ever created; the model never supplies an id. migration 038's
-- enforce_lead_assignee_membership trigger remains the final backstop.

alter table public.admin_concierge_commands
  drop constraint if exists admin_concierge_commands_capability_id_check;

alter table public.admin_concierge_commands
  add constraint admin_concierge_commands_capability_id_check
  check (capability_id in ('lead.status.update', 'feed.run.enqueue', 'lead.assign'));

create or replace function public.execute_admin_concierge_lead_assign_command(
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
  v_lead public.leads%rowtype;
  v_lead_id uuid;
  v_assignee uuid;
  v_expected_assignee text;
  v_assignee_label text;
  v_result jsonb;
begin
  select *
  into v_command
  from public.admin_concierge_commands command
  where command.id = p_command_id
    and command.tenant_id = p_tenant_id
    and command.actor_user_id = p_actor_user_id
    and command.capability_id = 'lead.assign'
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- Authorization must hold inside the write transaction, not just at the
  -- route. Locking the row stops a concurrent demotion racing a reviewed
  -- command into execution.
  perform 1
  from public.tenant_members member
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
    return jsonb_set(
      coalesce(v_command.result, jsonb_build_object('status', 'executed')),
      '{alreadyExecuted}', 'true'::jsonb
    );
  end if;

  if v_command.status <> 'pending' then
    return jsonb_build_object('status', v_command.status, 'error', coalesce(v_command.error, 'Command is no longer executable.'));
  end if;

  if v_command.expires_at <= now() then
    update public.admin_concierge_commands command
    set status = 'expired', error = 'Confirmation window expired.'
    where command.id = v_command.id;
    return jsonb_build_object('status', 'expired', 'error', 'Confirmation window expired.');
  end if;

  begin
    v_lead_id := (v_command.intent ->> 'leadId')::uuid;
    v_assignee := (v_command.intent ->> 'assigneeUserId')::uuid;
  exception when invalid_text_representation then
    v_lead_id := null;
    v_assignee := null;
  end;
  v_expected_assignee := v_command.preview #>> '{lead,currentAssignee}';
  v_assignee_label := coalesce(v_command.preview #>> '{assignee,label}', 'the selected teammate');

  if v_lead_id is null
    or v_assignee is null
    or (v_command.preview #>> '{lead,id}') is distinct from v_lead_id::text then
    update public.admin_concierge_commands command
    set status = 'failed', error = 'Command payload is invalid.'
    where command.id = v_command.id;
    return jsonb_build_object('status', 'failed', 'error', 'Command payload is invalid.');
  end if;

  -- The assignee must still be a member; 038's trigger would reject the write
  -- anyway, but failing the command cleanly gives a usable message.
  if not exists (
    select 1 from public.tenant_members member
    where member.tenant_id = p_tenant_id and member.user_id = v_assignee
  ) then
    update public.admin_concierge_commands command
    set status = 'failed', error = 'That teammate is no longer a member of this tenant.'
    where command.id = v_command.id;
    return jsonb_build_object('status', 'failed', 'error', 'That teammate is no longer a member of this tenant.');
  end if;

  select *
  into v_lead
  from public.leads lead
  where lead.id = v_lead_id
    and lead.tenant_id = p_tenant_id
  for update;

  if not found then
    update public.admin_concierge_commands command
    set status = 'failed', error = 'The selected lead no longer exists.'
    where command.id = v_command.id;
    return jsonb_build_object('status', 'failed', 'error', 'The selected lead no longer exists.');
  end if;

  -- Compare-and-swap: a concurrent reassignment from the dashboard must never
  -- be silently overwritten by a stale reviewed command.
  if coalesce(v_lead.assigned_to::text, '') is distinct from coalesce(v_expected_assignee, '') then
    update public.admin_concierge_commands command
    set status = 'failed',
        error = 'The lead was reassigned after this command was reviewed. Refresh and prepare a new command.'
    where command.id = v_command.id;
    return jsonb_build_object(
      'status', 'stale',
      'error', 'The lead was reassigned after this command was reviewed. Refresh and prepare a new command.'
    );
  end if;

  update public.leads lead
  set assigned_to = v_assignee
  where lead.id = v_lead.id
    and lead.tenant_id = p_tenant_id;

  insert into public.lead_activities (lead_id, tenant_id, actor_user_id, type, body)
  values (
    v_lead.id, p_tenant_id, p_actor_user_id, 'assignment',
    format('Assigned to %s by LUME concierge.', v_assignee_label)
  );

  v_result := jsonb_build_object(
    'status', 'executed',
    'leadId', v_lead.id,
    'assigneeUserId', v_assignee,
    'assigneeLabel', v_assignee_label
  );
  update public.admin_concierge_commands command
  set status = 'executed', confirmed_at = now(), executed_at = now(),
      result = v_result, error = null
  where command.id = v_command.id;

  return v_result;
end;
$$;

revoke all on function public.execute_admin_concierge_lead_assign_command(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.execute_admin_concierge_lead_assign_command(uuid, uuid, uuid)
  to service_role;
