-- 080_admin_concierge_commands.sql
-- Durable, server-only receipts for confirmed admin-concierge operations.
--
-- The first executable capability is intentionally narrow: changing one
-- tenant lead to a non-loss pipeline status. The command row is the immutable
-- reviewed plan and idempotency boundary; the SECURITY DEFINER function locks
-- it, performs the lead update, records a lead activity, and writes the
-- verified receipt in one database transaction.

create table if not exists public.admin_concierge_commands (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  capability_id text not null
    check (capability_id in ('lead.status.update', 'feed.run.enqueue')),
  intent jsonb not null default '{}'::jsonb
    check (jsonb_typeof(intent) = 'object' and octet_length(intent::text) <= 8192),
  preview jsonb not null default '{}'::jsonb
    check (jsonb_typeof(preview) = 'object' and octet_length(preview::text) <= 8192),
  status text not null default 'pending'
    check (status in ('pending', 'executed', 'failed', 'expired', 'cancelled')),
  -- Generated server-side. A unique receipt prevents duplicate confirmation
  -- requests from becoming duplicate writes across serverless instances.
  idempotency_key uuid not null default uuid_generate_v4(),
  result jsonb,
  error text,
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_concierge_commands_error_bounded
    check (error is null or char_length(error) <= 500),
  constraint admin_concierge_commands_result_valid
    check (result is null or (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 8192)),
  constraint admin_concierge_commands_tenant_idempotency_unique
    unique (tenant_id, idempotency_key)
);

create index if not exists admin_concierge_commands_actor_pending_idx
  on public.admin_concierge_commands (tenant_id, actor_user_id, created_at desc)
  where status = 'pending';
create index if not exists admin_concierge_commands_expiry_idx
  on public.admin_concierge_commands (expires_at)
  where status = 'pending';

alter table public.admin_concierge_commands enable row level security;
-- Command plans contain operational intent. They are intentionally readable
-- and writable only through trusted server routes after a fresh role check.
revoke all on table public.admin_concierge_commands from anon, authenticated;

drop trigger if exists admin_concierge_commands_set_updated_at on public.admin_concierge_commands;
create trigger admin_concierge_commands_set_updated_at
  before update on public.admin_concierge_commands
  for each row execute function public.set_updated_at();

create or replace function public.execute_admin_concierge_lead_status_command(
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
  v_preview_lead_id uuid;
  v_expected_status text;
  v_next_status text;
  v_result jsonb;
begin
  select *
  into v_command
  from public.admin_concierge_commands command
  where command.id = p_command_id
    and command.tenant_id = p_tenant_id
    and command.actor_user_id = p_actor_user_id
    and command.capability_id = 'lead.status.update'
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- The route checks this before calling us, but authorization must also be
  -- true inside the write transaction. Lock the membership row so a concurrent
  -- demotion/revocation cannot race a reviewed command into execution.
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
      '{alreadyExecuted}',
      'true'::jsonb
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
    v_preview_lead_id := (v_command.preview #>> '{lead,id}')::uuid;
    v_expected_status := v_command.preview #>> '{lead,currentStatus}';
    v_next_status := v_command.intent ->> 'status';
  exception when invalid_text_representation then
    v_lead_id := null;
    v_preview_lead_id := null;
  end;

  if v_lead_id is null
    or v_preview_lead_id is distinct from v_lead_id
    or v_expected_status not in ('new', 'contacted', 'qualified', 'won', 'lost')
    or v_next_status not in ('new', 'contacted', 'qualified', 'won') then
    update public.admin_concierge_commands command
    set status = 'failed', error = 'Command payload is invalid.'
    where command.id = v_command.id;
    return jsonb_build_object('status', 'failed', 'error', 'Command payload is invalid.');
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

  -- The reviewed preview is a compare-and-swap precondition. A concurrent
  -- dashboard edit must never be silently overwritten by a stale AI command.
  if v_lead.status is distinct from v_expected_status then
    update public.admin_concierge_commands command
    set status = 'failed',
        error = 'The lead changed after this command was reviewed. Refresh and prepare a new command.'
    where command.id = v_command.id;
    return jsonb_build_object(
      'status', 'stale',
      'error', 'The lead changed after this command was reviewed. Refresh and prepare a new command.'
    );
  end if;

  update public.leads lead
  set status = v_next_status,
      lost_reason = null
  where lead.id = v_lead.id
    and lead.tenant_id = p_tenant_id;

  insert into public.lead_activities (
    lead_id, tenant_id, actor_user_id, type, body
  ) values (
    v_lead.id,
    p_tenant_id,
    p_actor_user_id,
    'status_change',
    format('Updated by LUME concierge from %s to %s.', v_lead.status, v_next_status)
  );

  v_result := jsonb_build_object(
    'status', 'executed',
    'leadId', v_lead.id,
    'previousStatus', v_lead.status,
    'nextStatus', v_next_status
  );
  update public.admin_concierge_commands command
  set status = 'executed',
      confirmed_at = now(),
      executed_at = now(),
      result = v_result,
      error = null
  where command.id = v_command.id;

  return v_result;
end;
$$;

revoke all on function public.execute_admin_concierge_lead_status_command(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.execute_admin_concierge_lead_status_command(uuid, uuid, uuid)
  to service_role;

-- Queue a reviewed, named feed through migration 077's existing durable queue.
-- This command does not fetch or sync inventory itself; it only requests the
-- same bounded worker run as the existing Admin "Run now" button.
create or replace function public.execute_admin_concierge_feed_run_command(
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
  v_source public.inventory_feed_sources%rowtype;
  v_feed_source_id uuid;
  v_config_version integer;
  v_run_id uuid;
  v_result jsonb;
begin
  select *
  into v_command
  from public.admin_concierge_commands command
  where command.id = p_command_id
    and command.tenant_id = p_tenant_id
    and command.actor_user_id = p_actor_user_id
    and command.capability_id = 'feed.run.enqueue'
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- This matches the existing inventory integration UI: only owner/admin may
  -- trigger supplier work, and the role is locked inside the write transaction.
  perform 1
  from public.tenant_members member
  where member.tenant_id = p_tenant_id
    and member.user_id = p_actor_user_id
    and member.role in ('owner', 'admin')
  for update;
  if not found then
    update public.admin_concierge_commands command
    set status = 'failed', error = 'The operator no longer has permission to run inventory feeds.'
    where command.id = v_command.id;
    return jsonb_build_object('status', 'failed', 'error', 'The operator no longer has permission to run inventory feeds.');
  end if;

  if v_command.status = 'executed' then
    return jsonb_set(
      coalesce(v_command.result, jsonb_build_object('status', 'queued')),
      '{alreadyExecuted}',
      'true'::jsonb
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
    v_feed_source_id := (v_command.intent ->> 'feedSourceId')::uuid;
    v_config_version := (v_command.intent ->> 'configVersion')::integer;
  exception when invalid_text_representation then
    v_feed_source_id := null;
    v_config_version := null;
  end;

  if v_feed_source_id is null or v_config_version is null
    or (v_command.preview #>> '{feed,id}') is distinct from v_feed_source_id::text
    or (v_command.preview #>> '{feed,configVersion}') is distinct from v_config_version::text then
    update public.admin_concierge_commands command
    set status = 'failed', error = 'Command payload is invalid.'
    where command.id = v_command.id;
    return jsonb_build_object('status', 'failed', 'error', 'Command payload is invalid.');
  end if;

  select *
  into v_source
  from public.inventory_feed_sources source
  where source.id = v_feed_source_id
    and source.tenant_id = p_tenant_id
    and source.archived_at is null
  for update;

  if not found then
    update public.admin_concierge_commands command
    set status = 'failed', error = 'The selected inventory feed no longer exists.'
    where command.id = v_command.id;
    return jsonb_build_object('status', 'failed', 'error', 'The selected inventory feed no longer exists.');
  end if;

  if not v_source.enabled then
    update public.admin_concierge_commands command
    set status = 'failed', error = 'The selected inventory feed is paused and cannot be queued.'
    where command.id = v_command.id;
    return jsonb_build_object('status', 'failed', 'error', 'The selected inventory feed is paused and cannot be queued.');
  end if;

  if v_source.config_version <> v_config_version then
    update public.admin_concierge_commands command
    set status = 'failed', error = 'The inventory feed changed after this command was reviewed. Refresh and prepare a new command.'
    where command.id = v_command.id;
    return jsonb_build_object('status', 'stale', 'error', 'The inventory feed changed after this command was reviewed. Refresh and prepare a new command.');
  end if;

  v_run_id := public.enqueue_inventory_feed_run(v_source.id, p_tenant_id, 'manual');
  if v_run_id is null then
    update public.admin_concierge_commands command
    set status = 'failed', error = 'The inventory feed could not be queued.'
    where command.id = v_command.id;
    return jsonb_build_object('status', 'failed', 'error', 'The inventory feed could not be queued.');
  end if;

  v_result := jsonb_build_object(
    'status', 'queued',
    'feedSourceId', v_source.id,
    'feedName', v_source.name,
    'runId', v_run_id
  );
  update public.admin_concierge_commands command
  set status = 'executed',
      confirmed_at = now(),
      executed_at = now(),
      result = v_result,
      error = null
  where command.id = v_command.id;

  return v_result;
end;
$$;

revoke all on function public.execute_admin_concierge_feed_run_command(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.execute_admin_concierge_feed_run_command(uuid, uuid, uuid)
  to service_role;

comment on table public.admin_concierge_commands is
  'Server-only, reviewed admin-concierge plans and execution receipts.';
