-- 078_managed_inventory_sftp_sources.sql
-- Add authenticated, host-key-verified SFTP as a transport for the existing
-- managed inventory source queue. Plain FTP is deliberately unsupported.

alter table public.inventory_feed_sources
  add column if not exists sftp_host text,
  add column if not exists sftp_port integer,
  add column if not exists sftp_remote_path text,
  add column if not exists sftp_host_key_fingerprint text;

alter table public.inventory_feed_sources
  drop constraint if exists inventory_feed_sources_source_kind_check,
  add constraint inventory_feed_sources_source_kind_check
    check (source_kind in ('https', 'storage', 'sftp')),
  drop constraint if exists inventory_feed_sources_location_valid,
  add constraint inventory_feed_sources_location_valid check (
    (
      source_kind = 'https'
      and source_url is not null
      and source_object_path is null
      and sftp_host is null
      and sftp_port is null
      and sftp_remote_path is null
      and sftp_host_key_fingerprint is null
      and char_length(source_url) between 9 and 2048
      and source_url ~* '^https://[^[:space:]]+$'
    )
    or
    (
      source_kind = 'storage'
      and source_url is null
      and source_object_path is not null
      and sftp_host is null
      and sftp_port is null
      and sftp_remote_path is null
      and sftp_host_key_fingerprint is null
      and char_length(source_object_path) between 3 and 2048
      and split_part(source_object_path, '/', 1) = tenant_id::text
      and source_object_path !~ '(^/|(^|/)[.][.]?(/|$))'
    )
    or
    (
      source_kind = 'sftp'
      and source_url is null
      and source_object_path is null
      and sftp_host is not null
      and sftp_port is not null
      and sftp_remote_path is not null
      and sftp_host_key_fingerprint is not null
      and char_length(sftp_host) between 1 and 253
      and sftp_host = lower(sftp_host)
      and sftp_host !~ '[[:space:]@/?#]'
      and sftp_port between 1 and 65535
      and char_length(sftp_remote_path) between 1 and 2048
      and left(sftp_remote_path, 1) = '/'
      and sftp_remote_path !~ '(^|/)[.][.]?(/|$)'
      -- OpenSSH-compatible SHA-256 fingerprint, without base64 padding.
      and sftp_host_key_fingerprint ~ '^SHA256:[A-Za-z0-9+/]{43}$'
    )
  );

-- SFTP uses the same encrypted credential table as HTTPS, but it has a
-- transport-specific password credential. These RPCs deliberately reuse the
-- same config version, queue cancellation, and active-run boundary as the
-- HTTPS source RPCs instead of creating a second feed system.
create or replace function public.create_inventory_sftp_feed_source(
  p_tenant_id uuid,
  p_name text,
  p_sftp_host text,
  p_sftp_port integer,
  p_sftp_remote_path text,
  p_sftp_host_key_fingerprint text,
  p_source_format text,
  p_profile jsonb,
  p_sync_mode text,
  p_schedule_minutes integer,
  p_retry_delays_seconds integer[],
  p_enabled boolean,
  p_credential_ciphertext text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_credential_ciphertext is null then
    raise exception 'SFTP sources require an encrypted username/password credential.'
      using errcode = '22023';
  end if;

  insert into public.inventory_feed_sources (
    tenant_id, name, source_kind, sftp_host, sftp_port, sftp_remote_path,
    sftp_host_key_fingerprint, source_format, profile, sync_mode,
    schedule_minutes, retry_delays_seconds, enabled, next_scheduled_at
  ) values (
    p_tenant_id, p_name, 'sftp', p_sftp_host, p_sftp_port,
    p_sftp_remote_path, p_sftp_host_key_fingerprint, p_source_format,
    p_profile, p_sync_mode, p_schedule_minutes, p_retry_delays_seconds,
    p_enabled,
    case when p_enabled and p_schedule_minutes is not null then now() else null end
  )
  returning id into v_id;

  insert into public.inventory_feed_source_credentials (
    feed_source_id, tenant_id, credential_ciphertext
  ) values (
    v_id, p_tenant_id, p_credential_ciphertext
  );

  return v_id;
end;
$$;

create or replace function public.update_inventory_sftp_feed_source(
  p_feed_source_id uuid,
  p_tenant_id uuid,
  p_name text,
  p_sftp_host text,
  p_sftp_port integer,
  p_sftp_remote_path text,
  p_sftp_host_key_fingerprint text,
  p_source_format text,
  p_profile jsonb,
  p_sync_mode text,
  p_schedule_minutes integer,
  p_retry_delays_seconds integer[],
  p_enabled boolean,
  p_credential_ciphertext text default null,
  p_replace_credential boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  select source.id
  into v_id
  from public.inventory_feed_sources source
  where source.id = p_feed_source_id
    and source.tenant_id = p_tenant_id
    and source.source_kind = 'sftp'
    and source.archived_at is null
  for update;

  if v_id is null then
    return false;
  end if;

  if exists (
    select 1
    from public.inventory_feed_runs run
    where run.feed_source_id = v_id
      and run.tenant_id = p_tenant_id
      and run.status = 'processing'
  ) then
    raise exception 'Wait for the active managed feed run to finish before updating this source.'
      using errcode = '55000';
  end if;

  if p_credential_ciphertext is not null and not p_replace_credential then
    raise exception 'p_replace_credential must be true when changing a credential'
      using errcode = '22023';
  end if;

  if p_replace_credential and p_credential_ciphertext is null then
    raise exception 'SFTP sources require an encrypted username/password credential.'
      using errcode = '22023';
  end if;

  update public.inventory_feed_sources source
  set
    name = p_name,
    sftp_host = p_sftp_host,
    sftp_port = p_sftp_port,
    sftp_remote_path = p_sftp_remote_path,
    sftp_host_key_fingerprint = p_sftp_host_key_fingerprint,
    source_format = p_source_format,
    profile = p_profile,
    sync_mode = p_sync_mode,
    config_version = source.config_version + 1,
    last_source_hash = null,
    schedule_minutes = p_schedule_minutes,
    retry_delays_seconds = p_retry_delays_seconds,
    enabled = p_enabled,
    next_scheduled_at = case
      when p_enabled and p_schedule_minutes is not null then now()
      else null
    end
  where source.id = v_id
    and source.tenant_id = p_tenant_id;

  update public.inventory_feed_runs run
  set
    status = 'cancelled',
    last_error = 'A newer managed inventory source configuration superseded this queued run.',
    completed_at = now()
  where run.feed_source_id = v_id
    and run.tenant_id = p_tenant_id
    and run.status in ('pending', 'retrying');

  if p_replace_credential then
    insert into public.inventory_feed_source_credentials (
      feed_source_id, tenant_id, credential_ciphertext
    ) values (
      v_id, p_tenant_id, p_credential_ciphertext
    )
    on conflict (feed_source_id) do update
      set credential_ciphertext = excluded.credential_ciphertext,
          updated_at = now();
  end if;

  return true;
end;
$$;

-- The run snapshot is the only worker input. Include SFTP connection details
-- so retries cannot pick up a later host/path/fingerprint configuration.
create or replace function public.enqueue_inventory_feed_run(
  p_feed_source_id uuid,
  p_tenant_id uuid,
  p_run_trigger text default 'manual'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source public.inventory_feed_sources%rowtype;
  v_run_id uuid;
begin
  if p_run_trigger not in ('manual', 'scheduled') then
    raise exception 'Invalid inventory feed run trigger: %', p_run_trigger
      using errcode = '22023';
  end if;

  select *
  into v_source
  from public.inventory_feed_sources source
  where source.id = p_feed_source_id
    and source.tenant_id = p_tenant_id
    and source.enabled = true
    and source.archived_at is null
  for update;

  if not found then
    return null;
  end if;

  insert into public.inventory_feed_runs (
    tenant_id, feed_source_id, run_trigger, source_snapshot, next_attempt_at
  ) values (
    v_source.tenant_id,
    v_source.id,
    p_run_trigger,
    jsonb_build_object(
      'sourceKind', v_source.source_kind,
      'sourceUrl', v_source.source_url,
      'sourceObjectPath', v_source.source_object_path,
      'sftpHost', v_source.sftp_host,
      'sftpPort', v_source.sftp_port,
      'sftpRemotePath', v_source.sftp_remote_path,
      'sftpHostKeyFingerprint', v_source.sftp_host_key_fingerprint,
      'sourceFormat', v_source.source_format,
      'profile', v_source.profile,
      'syncMode', v_source.sync_mode,
      'configVersion', v_source.config_version,
      'retryDelaysSeconds', v_source.retry_delays_seconds
    ),
    now()
  )
  on conflict (feed_source_id)
    where status in ('pending', 'processing', 'retrying')
  do update set
    next_attempt_at = least(
      public.inventory_feed_runs.next_attempt_at,
      excluded.next_attempt_at
    ),
    updated_at = now()
  returning id into v_run_id;

  update public.inventory_feed_sources
  set last_enqueued_at = now()
  where id = v_source.id and tenant_id = v_source.tenant_id;

  return v_run_id;
end;
$$;

revoke all on function public.create_inventory_sftp_feed_source(
  uuid, text, text, integer, text, text, text, jsonb, text, integer, integer[], boolean, text
) from public, anon, authenticated;
revoke all on function public.update_inventory_sftp_feed_source(
  uuid, uuid, text, text, integer, text, text, text, jsonb, text, integer, integer[], boolean, text, boolean
) from public, anon, authenticated;
-- Re-assert service-only access for the replaced queue function too.
revoke all on function public.enqueue_inventory_feed_run(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.create_inventory_sftp_feed_source(
  uuid, text, text, integer, text, text, text, jsonb, text, integer, integer[], boolean, text
) to service_role;
grant execute on function public.update_inventory_sftp_feed_source(
  uuid, uuid, text, text, integer, text, text, text, jsonb, text, integer, integer[], boolean, text, boolean
) to service_role;
grant execute on function public.enqueue_inventory_feed_run(uuid, uuid, text)
  to service_role;

comment on column public.inventory_feed_sources.sftp_host_key_fingerprint is
  'Required OpenSSH SHA-256 host-key fingerprint for SFTP sources; mismatches hard-fail and require an explicit Admin update.';
