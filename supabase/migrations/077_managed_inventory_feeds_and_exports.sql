-- 077_managed_inventory_feeds_and_exports.sql
-- Managed inbound inventory sources and outbound inventory syndication.
--
-- This migration deliberately creates configuration, durable work queues, and
-- service-only queue leases only. It does not fetch a feed, transmit inventory,
-- delete/recreate a vehicle, or add a DealerSync/FTP adapter. Network safety,
-- parsing, normalization, and vehicle mutation remain trusted application-worker
-- responsibilities.

-- Retry schedules are tenant configuration, so keep them finite and bounded.
create or replace function public.valid_inventory_retry_seconds(value integer[])
returns boolean
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select cardinality(value) between 1 and 10
    and array_position(value, null::integer) is null
    and not exists (
      select 1
      from unnest(value) delay
      where delay < 1 or delay > 86400
    );
$$;

-- ─── Managed inbound sources ───────────────────────────────────────────────

create table if not exists public.inventory_feed_sources (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  -- HTTPS and a tenant-owned private-storage object are intentionally the only
  -- supported transport kinds. In particular, no FTP/SFTP/DealerSync adapter
  -- is represented here.
  source_kind text not null default 'https'
    check (source_kind in ('https', 'storage')),
  source_url text,
  source_object_path text,
  source_format text not null default 'csv'
    check (source_format in ('csv', 'json', 'xml')),
  -- Safe declarative parser/mapping options. No executable expression language
  -- is stored in the database.
  profile jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(profile) = 'object'
      and octet_length(profile::text) <= 32768
    ),
  -- Both modes update records in place. 'mirror' must never imply destructive
  -- deletion of records absent from a source snapshot.
  sync_mode text not null default 'hybrid'
    check (sync_mode in ('hybrid', 'mirror')),
  enabled boolean not null default true,
  schedule_minutes integer
    check (schedule_minutes is null or schedule_minutes between 15 and 10080),
  retry_delays_seconds integer[] not null
    default array[60, 300, 1800, 3600, 21600]::integer[]
    check (public.valid_inventory_retry_seconds(retry_delays_seconds)),
  next_scheduled_at timestamptz,
  last_enqueued_at timestamptz,
  last_attempt_at timestamptz,
  last_succeeded_at timestamptz,
  last_source_hash text,
  -- Advances on source/profile edits so payload no-op suppression never lets
  -- an old queued configuration suppress the current one.
  config_version integer not null default 1 check (config_version >= 1),
  consecutive_failure_count integer not null default 0
    check (consecutive_failure_count >= 0),
  last_error text,
  -- Archival preserves immutable run history and prevents an old source from
  -- being re-enqueued. It is intentionally not a vehicle/inventory deletion.
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_feed_sources_id_tenant_unique unique (id, tenant_id),
  constraint inventory_feed_sources_name_bounded check (
    char_length(btrim(name)) between 1 and 100
  ),
  constraint inventory_feed_sources_location_valid check (
    (
      source_kind = 'https'
      and source_url is not null
      and source_object_path is null
      and char_length(source_url) between 9 and 2048
      and source_url ~* '^https://[^[:space:]]+$'
    )
    or
    (
      source_kind = 'storage'
      and source_url is null
      and source_object_path is not null
      and char_length(source_object_path) between 3 and 2048
      and split_part(source_object_path, '/', 1) = tenant_id::text
      and source_object_path !~ '(^/|(^|/)[.][.]?(/|$))'
    )
  ),
  constraint inventory_feed_sources_hash_valid check (
    last_source_hash is null or last_source_hash ~* '^[0-9a-f]{64}$'
  ),
  constraint inventory_feed_sources_last_error_bounded check (
    last_error is null or char_length(last_error) <= 500
  )
);

-- Encrypted opaque credential envelopes, e.g. request headers/basic auth/API
-- tokens. There is deliberately no RLS policy on this table.
create table if not exists public.inventory_feed_source_credentials (
  feed_source_id uuid primary key,
  tenant_id uuid not null,
  credential_ciphertext text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_feed_source_credentials_source_tenant_fk
    foreign key (feed_source_id, tenant_id)
    references public.inventory_feed_sources (id, tenant_id)
    on delete cascade,
  constraint inventory_feed_source_credentials_ciphertext_bounded check (
    char_length(credential_ciphertext) between 32 and 16384
  )
);

create table if not exists public.inventory_feed_runs (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null,
  feed_source_id uuid not null,
  run_trigger text not null default 'manual'
    check (run_trigger in ('manual', 'scheduled')),
  -- A queued run owns the exact non-secret source configuration it was created
  -- with, so a later profile edit cannot change an in-flight/retried run.
  source_snapshot jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(source_snapshot) = 'object'
      and octet_length(source_snapshot::text) <= 65536
    ),
  status text not null default 'pending'
    check (status in (
      'pending', 'processing', 'retrying', 'succeeded', 'partial', 'skipped',
      'failed', 'dead_letter', 'cancelled'
    )),
  attempt_count integer not null default 0
    check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  source_hash text,
  input_bytes bigint,
  total_rows integer not null default 0 check (total_rows >= 0),
  processed_rows integer not null default 0 check (processed_rows >= 0),
  created_rows integer not null default 0 check (created_rows >= 0),
  updated_rows integer not null default 0 check (updated_rows >= 0),
  skipped_rows integer not null default 0 check (skipped_rows >= 0),
  conflict_rows integer not null default 0 check (conflict_rows >= 0),
  failed_rows integer not null default 0 check (failed_rows >= 0),
  errors jsonb not null default '[]'::jsonb,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_feed_runs_source_tenant_fk
    foreign key (feed_source_id, tenant_id)
    references public.inventory_feed_sources (id, tenant_id)
    on delete cascade,
  constraint inventory_feed_runs_id_tenant_unique unique (id, tenant_id),
  constraint inventory_feed_runs_hash_valid check (
    source_hash is null or source_hash ~* '^[0-9a-f]{64}$'
  ),
  constraint inventory_feed_runs_input_bytes_valid check (
    input_bytes is null or input_bytes between 0 and 104857600
  ),
  constraint inventory_feed_runs_errors_bounded check (
    jsonb_typeof(errors) = 'array'
    and case
      when jsonb_typeof(errors) = 'array' then jsonb_array_length(errors) <= 100
      else false
    end
  ),
  constraint inventory_feed_runs_last_error_bounded check (
    last_error is null or char_length(last_error) <= 500
  ),
  constraint inventory_feed_runs_processed_within_total check (
    processed_rows <= total_rows
  ),
  constraint inventory_feed_runs_count_consistency check (
    processed_rows =
      created_rows + updated_rows + skipped_rows + conflict_rows + failed_rows
  ),
  constraint inventory_feed_runs_completion_order check (
    completed_at is null or started_at is null or completed_at >= started_at
  )
);

create index if not exists inventory_feed_sources_schedule_due_idx
  on public.inventory_feed_sources (next_scheduled_at, id)
  where enabled = true and archived_at is null and schedule_minutes is not null;
-- Archive is the normal Admin removal path. Reusing a retired configuration
-- name should not require deleting its immutable run history.
create unique index if not exists inventory_feed_sources_active_tenant_name_unique
  on public.inventory_feed_sources (tenant_id, name)
  where archived_at is null;
create index if not exists inventory_feed_sources_tenant_enabled_idx
  on public.inventory_feed_sources (tenant_id, enabled);
create index if not exists inventory_feed_runs_due_idx
  on public.inventory_feed_runs (next_attempt_at, id)
  where status in ('pending', 'retrying');
create index if not exists inventory_feed_runs_stale_idx
  on public.inventory_feed_runs (updated_at)
  where status = 'processing';
create index if not exists inventory_feed_runs_tenant_status_idx
  on public.inventory_feed_runs (tenant_id, status, created_at desc);
-- A source has at most one active sync. Terminal history remains append-only.
create unique index if not exists inventory_feed_runs_one_active_source_idx
  on public.inventory_feed_runs (feed_source_id)
  where status in ('pending', 'processing', 'retrying');

-- One supplier source may run per source, but two suppliers for the same
-- tenant must not independently decide a new VIN/stock is absent and create
-- duplicate inventory. This durable lease serializes feed execution per
-- tenant while allowing different tenants to run in parallel.
create table if not exists public.inventory_feed_tenant_leases (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  run_id uuid not null,
  claimed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_feed_tenant_leases_run_tenant_fk
    foreign key (run_id, tenant_id)
    references public.inventory_feed_runs (id, tenant_id)
    on delete cascade
);
create index if not exists inventory_feed_tenant_leases_stale_idx
  on public.inventory_feed_tenant_leases (claimed_at);

-- ─── Managed outbound destinations ─────────────────────────────────────────

create table if not exists public.inventory_export_destinations (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  endpoint_url text not null,
  http_method text not null default 'POST'
    check (http_method in ('POST', 'PUT')),
  export_format text not null default 'csv'
    check (export_format in ('csv', 'json', 'xml')),
  -- Safe declarative field mapping/serialization options only.
  profile jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(profile) = 'object'
      and octet_length(profile::text) <= 32768
    ),
  enabled boolean not null default true,
  schedule_minutes integer
    check (schedule_minutes is null or schedule_minutes between 15 and 10080),
  retry_delays_seconds integer[] not null
    default array[60, 300, 1800, 3600, 21600]::integer[]
    check (public.valid_inventory_retry_seconds(retry_delays_seconds)),
  next_scheduled_at timestamptz,
  last_enqueued_at timestamptz,
  last_attempt_at timestamptz,
  last_succeeded_at timestamptz,
  last_noop_at timestamptz,
  last_payload_hash text,
  -- Advances on every delivery-affecting edit. A matching payload must still
  -- be delivered once to a newly configured endpoint or credential.
  config_version integer not null default 1 check (config_version >= 1),
  consecutive_failure_count integer not null default 0
    check (consecutive_failure_count >= 0),
  last_error text,
  -- Removing a destination in Admin archives it and preserves run evidence.
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_export_destinations_id_tenant_unique unique (id, tenant_id),
  constraint inventory_export_destinations_name_bounded check (
    char_length(btrim(name)) between 1 and 100
  ),
  constraint inventory_export_destinations_endpoint_valid check (
    char_length(endpoint_url) between 9 and 2048
    and endpoint_url ~* '^https://[^[:space:]]+$'
  ),
  constraint inventory_export_destinations_hash_valid check (
    last_payload_hash is null or last_payload_hash ~* '^[0-9a-f]{64}$'
  ),
  constraint inventory_export_destinations_last_error_bounded check (
    last_error is null or char_length(last_error) <= 500
  )
);

-- Endpoint credentials are optional. A row exists only when the trusted
-- server has a non-null encrypted credential envelope to save.
create table if not exists public.inventory_export_destination_credentials (
  export_destination_id uuid primary key,
  tenant_id uuid not null,
  credential_ciphertext text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_export_destination_credentials_destination_tenant_fk
    foreign key (export_destination_id, tenant_id)
    references public.inventory_export_destinations (id, tenant_id)
    on delete cascade,
  constraint inventory_export_destination_credentials_ciphertext_bounded check (
    char_length(credential_ciphertext) between 32 and 16384
  )
);

create table if not exists public.inventory_export_runs (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null,
  export_destination_id uuid not null,
  run_trigger text not null default 'manual'
    check (run_trigger in ('manual', 'scheduled')),
  destination_snapshot jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(destination_snapshot) = 'object'
      and octet_length(destination_snapshot::text) <= 65536
    ),
  status text not null default 'pending'
    check (status in (
      'pending', 'delivering', 'retrying', 'succeeded', 'skipped',
      'failed', 'dead_letter', 'cancelled'
    )),
  attempt_count integer not null default 0
    check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  payload_hash text,
  record_count integer not null default 0 check (record_count >= 0),
  response_status integer,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_export_runs_destination_tenant_fk
    foreign key (export_destination_id, tenant_id)
    references public.inventory_export_destinations (id, tenant_id)
    on delete cascade,
  constraint inventory_export_runs_id_tenant_unique unique (id, tenant_id),
  constraint inventory_export_runs_hash_valid check (
    payload_hash is null or payload_hash ~* '^[0-9a-f]{64}$'
  ),
  constraint inventory_export_runs_response_status_valid check (
    response_status is null or response_status between 100 and 599
  ),
  constraint inventory_export_runs_last_error_bounded check (
    last_error is null or char_length(last_error) <= 500
  ),
  constraint inventory_export_runs_completion_order check (
    completed_at is null or started_at is null or completed_at >= started_at
  )
);

create index if not exists inventory_export_destinations_schedule_due_idx
  on public.inventory_export_destinations (next_scheduled_at, id)
  where enabled = true and archived_at is null and schedule_minutes is not null;
create unique index if not exists inventory_export_destinations_active_tenant_name_unique
  on public.inventory_export_destinations (tenant_id, name)
  where archived_at is null;
create index if not exists inventory_export_destinations_tenant_enabled_idx
  on public.inventory_export_destinations (tenant_id, enabled);
create index if not exists inventory_export_runs_due_idx
  on public.inventory_export_runs (next_attempt_at, id)
  where status in ('pending', 'retrying');
create index if not exists inventory_export_runs_stale_idx
  on public.inventory_export_runs (updated_at)
  where status = 'delivering';
create index if not exists inventory_export_runs_tenant_status_idx
  on public.inventory_export_runs (tenant_id, status, created_at desc);
-- A destination has at most one active export. A worker performs semantic
-- no-op comparison before delivery and records skipped runs as history.
create unique index if not exists inventory_export_runs_one_active_destination_idx
  on public.inventory_export_runs (export_destination_id)
  where status in ('pending', 'delivering', 'retrying');

-- ─── Tenant isolation and access grants ────────────────────────────────────

alter table public.inventory_feed_sources enable row level security;
alter table public.inventory_feed_source_credentials enable row level security;
alter table public.inventory_feed_runs enable row level security;
alter table public.inventory_feed_tenant_leases enable row level security;
alter table public.inventory_export_destinations enable row level security;
alter table public.inventory_export_destination_credentials enable row level security;
alter table public.inventory_export_runs enable row level security;

create policy "inventory_feed_sources_select_member"
  on public.inventory_feed_sources
  for select to authenticated
  using (tenant_id in (select public.tenant_ids_for_current_user()));

create policy "inventory_feed_runs_select_member"
  on public.inventory_feed_runs
  for select to authenticated
  using (tenant_id in (select public.tenant_ids_for_current_user()));

create policy "inventory_export_destinations_select_member"
  on public.inventory_export_destinations
  for select to authenticated
  using (tenant_id in (select public.tenant_ids_for_current_user()));

create policy "inventory_export_runs_select_member"
  on public.inventory_export_runs
  for select to authenticated
  using (tenant_id in (select public.tenant_ids_for_current_user()));

-- Configuration writes and all queue transitions go through service-only RPCs
-- after the Next.js route has performed tenant membership/origin checks. This
-- prevents direct browser mutation and keeps encrypted credentials deny-all.
revoke all on table public.inventory_feed_sources,
  public.inventory_feed_runs,
  public.inventory_export_destinations,
  public.inventory_export_runs
  from anon;
revoke insert, update, delete, truncate on table public.inventory_feed_sources,
  public.inventory_feed_runs,
  public.inventory_export_destinations,
  public.inventory_export_runs
  from authenticated;
grant select on table public.inventory_feed_sources,
  public.inventory_feed_runs,
  public.inventory_export_destinations,
  public.inventory_export_runs
  to authenticated;
grant select, insert, update on table public.inventory_feed_sources,
  public.inventory_feed_runs,
  public.inventory_export_destinations,
  public.inventory_export_runs
  to service_role;

-- Deliberately no policy on either credential table. They are not available
-- through the browser Data API, including to tenant owners.
revoke all on table public.inventory_feed_source_credentials,
  public.inventory_export_destination_credentials,
  public.inventory_feed_tenant_leases
  from public, anon, authenticated;
grant select, insert, update, delete on table public.inventory_feed_source_credentials,
  public.inventory_export_destination_credentials,
  public.inventory_feed_tenant_leases
  to service_role;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'inventory_feed_sources_set_updated_at'
      and tgrelid = 'public.inventory_feed_sources'::regclass
  ) then
    create trigger inventory_feed_sources_set_updated_at
      before update on public.inventory_feed_sources
      for each row execute function public.set_updated_at();
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'inventory_feed_tenant_leases_set_updated_at'
      and tgrelid = 'public.inventory_feed_tenant_leases'::regclass
  ) then
    create trigger inventory_feed_tenant_leases_set_updated_at
      before update on public.inventory_feed_tenant_leases
      for each row execute function public.set_updated_at();
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'inventory_feed_source_credentials_set_updated_at'
      and tgrelid = 'public.inventory_feed_source_credentials'::regclass
  ) then
    create trigger inventory_feed_source_credentials_set_updated_at
      before update on public.inventory_feed_source_credentials
      for each row execute function public.set_updated_at();
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'inventory_feed_runs_set_updated_at'
      and tgrelid = 'public.inventory_feed_runs'::regclass
  ) then
    create trigger inventory_feed_runs_set_updated_at
      before update on public.inventory_feed_runs
      for each row execute function public.set_updated_at();
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'inventory_export_destinations_set_updated_at'
      and tgrelid = 'public.inventory_export_destinations'::regclass
  ) then
    create trigger inventory_export_destinations_set_updated_at
      before update on public.inventory_export_destinations
      for each row execute function public.set_updated_at();
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'inventory_export_destination_credentials_set_updated_at'
      and tgrelid = 'public.inventory_export_destination_credentials'::regclass
  ) then
    create trigger inventory_export_destination_credentials_set_updated_at
      before update on public.inventory_export_destination_credentials
      for each row execute function public.set_updated_at();
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'inventory_export_runs_set_updated_at'
      and tgrelid = 'public.inventory_export_runs'::regclass
  ) then
    create trigger inventory_export_runs_set_updated_at
      before update on public.inventory_export_runs
      for each row execute function public.set_updated_at();
  end if;
end;
$$;

-- ─── Service-only source configuration and durable inbound queue ───────────

create or replace function public.create_inventory_feed_source(
  p_tenant_id uuid,
  p_name text,
  p_source_kind text,
  p_source_url text,
  p_source_object_path text,
  p_source_format text,
  p_profile jsonb,
  p_sync_mode text,
  p_schedule_minutes integer,
  p_retry_delays_seconds integer[],
  p_enabled boolean,
  p_credential_ciphertext text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into public.inventory_feed_sources (
    tenant_id, name, source_kind, source_url, source_object_path, source_format,
    profile, sync_mode, schedule_minutes, retry_delays_seconds, enabled,
    next_scheduled_at
  ) values (
    p_tenant_id, p_name, p_source_kind, p_source_url, p_source_object_path,
    p_source_format, p_profile, p_sync_mode, p_schedule_minutes,
    p_retry_delays_seconds, p_enabled,
    case when p_enabled and p_schedule_minutes is not null then now() else null end
  )
  returning id into v_id;

  -- Public endpoints may have no secret. Only create a credential row when a
  -- non-null encrypted envelope was actually supplied.
  if p_credential_ciphertext is not null then
    insert into public.inventory_feed_source_credentials (
      feed_source_id, tenant_id, credential_ciphertext
    ) values (
      v_id, p_tenant_id, p_credential_ciphertext
    );
  end if;

  return v_id;
end;
$$;

create or replace function public.update_inventory_feed_source(
  p_feed_source_id uuid,
  p_tenant_id uuid,
  p_name text,
  p_source_kind text,
  p_source_url text,
  p_source_object_path text,
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
  -- Serialize edits with claims and never pair a new credential with an old
  -- queued snapshot. A processing worker already has its old credential in
  -- memory, so require it to finish before its configuration can change.
  select source.id
  into v_id
  from public.inventory_feed_sources source
  where source.id = p_feed_source_id
    and source.tenant_id = p_tenant_id
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

  update public.inventory_feed_sources source
  set
    name = p_name,
    source_kind = p_source_kind,
    source_url = p_source_url,
    source_object_path = p_source_object_path,
    source_format = p_source_format,
    profile = p_profile,
    sync_mode = p_sync_mode,
    config_version = source.config_version + 1,
    last_source_hash = null,
    schedule_minutes = p_schedule_minutes,
    retry_delays_seconds = p_retry_delays_seconds,
    enabled = p_enabled,
    next_scheduled_at = case
      when p_enabled and p_schedule_minutes is not null
        then now()
      else null
    end
  where source.id = v_id
    and source.tenant_id = p_tenant_id;

  -- Keep evidence, but never let an old endpoint/profile/credential snapshot
  -- become the run returned by a subsequent "Run now".
  update public.inventory_feed_runs run
  set
    status = 'cancelled',
    last_error = 'A newer managed inventory source configuration superseded this queued run.',
    completed_at = now()
  where run.feed_source_id = v_id
    and run.tenant_id = p_tenant_id
    and run.status in ('pending', 'retrying');

  -- Null normally means retain the existing credential, allowing a public
  -- endpoint to be edited without an encryption key. An explicit replacement
  -- request may either upsert a new encrypted envelope or intentionally clear
  -- the saved credential when authentication is switched off.
  if p_replace_credential then
    if p_credential_ciphertext is null then
      delete from public.inventory_feed_source_credentials credential
      where credential.feed_source_id = v_id
        and credential.tenant_id = p_tenant_id;
    else
      insert into public.inventory_feed_source_credentials (
        feed_source_id, tenant_id, credential_ciphertext
      ) values (
        v_id, p_tenant_id, p_credential_ciphertext
      )
      on conflict (feed_source_id) do update
        set credential_ciphertext = excluded.credential_ciphertext,
            updated_at = now();
    end if;
  end if;

  return true;
end;
$$;

-- Pausing is an explicit future-work boundary. It never leaves a dormant
-- queued snapshot that could later run after the source is re-enabled.
create or replace function public.set_inventory_feed_source_enabled(
  p_feed_source_id uuid,
  p_tenant_id uuid,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_enabled is null then
    raise exception 'Managed inventory source enabled state is required.'
      using errcode = '22023';
  end if;

  select source.id
  into v_id
  from public.inventory_feed_sources source
  where source.id = p_feed_source_id
    and source.tenant_id = p_tenant_id
    and source.archived_at is null
  for update;

  if v_id is null then
    return false;
  end if;

  if not p_enabled and exists (
    select 1
    from public.inventory_feed_runs run
    where run.feed_source_id = v_id
      and run.tenant_id = p_tenant_id
      and run.status = 'processing'
  ) then
    raise exception 'Wait for the active managed feed run to finish before pausing this source.'
      using errcode = '55000';
  end if;

  update public.inventory_feed_sources source
  set
    enabled = p_enabled,
    next_scheduled_at = case
      when p_enabled and source.schedule_minutes is not null then now()
      else null
    end
  where source.id = v_id
    and source.tenant_id = p_tenant_id;

  if not p_enabled then
    update public.inventory_feed_runs run
    set
      status = 'cancelled',
      last_error = 'Managed inventory source was paused before this run began.',
      completed_at = now()
    where run.feed_source_id = v_id
      and run.tenant_id = p_tenant_id
      and run.status in ('pending', 'retrying');
  end if;

  return true;
end;
$$;

-- Archive rather than delete so operators keep a durable audit trail. A
-- processing job must finish before archival; that prevents a source removed
-- from Admin from being able to mutate inventory through a snapshot already
-- held by a worker. Pending/retried work is cancelled atomically.
create or replace function public.archive_inventory_feed_source(
  p_feed_source_id uuid,
  p_tenant_id uuid
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
    raise exception 'Wait for the active managed feed run to finish before archiving this source.'
      using errcode = '55000';
  end if;

  update public.inventory_feed_sources source
  set
    enabled = false,
    next_scheduled_at = null,
    archived_at = coalesce(source.archived_at, now())
  where source.id = p_feed_source_id
    and source.tenant_id = p_tenant_id
    and source.id = v_id;

  update public.inventory_feed_runs run
  set
    status = 'cancelled',
    last_error = 'Managed inventory source was archived.',
    completed_at = now()
  where run.feed_source_id = v_id
    and run.tenant_id = p_tenant_id
    and run.status in ('pending', 'retrying');

  delete from public.inventory_feed_source_credentials credential
  where credential.feed_source_id = v_id
    and credential.tenant_id = p_tenant_id;

  return true;
end;
$$;

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

create or replace function public.enqueue_due_inventory_feed_runs(
  p_limit integer default 25
)
returns table (run_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source record;
  v_run_id uuid;
begin
  for v_source in
    select source.id, source.tenant_id, source.schedule_minutes
    from public.inventory_feed_sources source
    where source.enabled = true
      and source.archived_at is null
      and source.schedule_minutes is not null
      and source.next_scheduled_at <= now()
    order by source.next_scheduled_at, source.id
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
    for update skip locked
  loop
    update public.inventory_feed_sources source
    set next_scheduled_at = now()
      + make_interval(mins => v_source.schedule_minutes)
    where source.id = v_source.id;

    v_run_id := public.enqueue_inventory_feed_run(v_source.id, v_source.tenant_id, 'scheduled');
    if v_run_id is not null then
      run_id := v_run_id;
      return next;
    end if;
  end loop;
end;
$$;

create or replace function public.claim_inventory_feed_runs(
  p_limit integer default 25
)
returns table (
  id uuid,
  tenant_id uuid,
  feed_source_id uuid,
  run_trigger text,
  source_snapshot jsonb,
  attempt_count integer,
  credential_ciphertext text,
  retry_delays_seconds integer[],
  last_source_hash text,
  source_config_version integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_claim_count integer := 0;
  v_candidate record;
  v_run public.inventory_feed_runs%rowtype;
  v_acquired integer;
begin
  -- A serverless invocation that dies leaves both the run and lease behind.
  -- Claims reclaim them together after the same bounded lease interval.
  delete from public.inventory_feed_tenant_leases lease
  where lease.claimed_at <= now() - interval '15 minutes';

  for v_candidate in
    select run.id, run.tenant_id
    from public.inventory_feed_runs run
    join public.inventory_feed_sources source
      on source.id = run.feed_source_id
      and source.tenant_id = run.tenant_id
    left join public.inventory_feed_tenant_leases lease
      on lease.tenant_id = run.tenant_id
      and lease.claimed_at > now() - interval '15 minutes'
    where source.enabled = true
      and source.archived_at is null
      and lease.tenant_id is null
      and (
        (run.status in ('pending', 'retrying') and run.next_attempt_at <= now())
        or (
          run.status = 'processing'
          and run.updated_at <= now() - interval '15 minutes'
        )
    )
    order by run.next_attempt_at, run.id
    limit least(v_limit * 4, 100)
    for update of run, source skip locked
  loop
    exit when v_claim_count >= v_limit;

    v_acquired := null;
    insert into public.inventory_feed_tenant_leases (tenant_id, run_id, claimed_at)
    values (v_candidate.tenant_id, v_candidate.id, now())
    on conflict (tenant_id) do update
      set run_id = excluded.run_id,
          claimed_at = excluded.claimed_at
      where public.inventory_feed_tenant_leases.claimed_at <= now() - interval '15 minutes'
    returning 1 into v_acquired;
    if not found then
      continue;
    end if;

    update public.inventory_feed_runs run
    set
      status = 'processing',
      attempt_count = run.attempt_count + 1,
      claimed_at = now(),
      started_at = coalesce(run.started_at, now()),
      last_error = null
    where run.id = v_candidate.id
      and run.tenant_id = v_candidate.tenant_id
      and run.status in ('pending', 'retrying', 'processing')
    returning run.* into v_run;

    if not found then
      delete from public.inventory_feed_tenant_leases lease
      where lease.tenant_id = v_candidate.tenant_id
        and lease.run_id = v_candidate.id;
      continue;
    end if;

    v_claim_count := v_claim_count + 1;
    return query
    select
      v_run.id,
      v_run.tenant_id,
      v_run.feed_source_id,
      v_run.run_trigger,
      v_run.source_snapshot,
      v_run.attempt_count,
      credential.credential_ciphertext,
      coalesce(
        (
          select array_agg(retry_delay.value::integer order by retry_delay.ordinality)
          from jsonb_array_elements_text(
            v_run.source_snapshot -> 'retryDelaysSeconds'
          ) with ordinality as retry_delay(value, ordinality)
      ),
        source.retry_delays_seconds
      ),
      source.last_source_hash,
      source.config_version
    from public.inventory_feed_sources source
    left join public.inventory_feed_source_credentials credential
      on credential.feed_source_id = v_run.feed_source_id
      and credential.tenant_id = v_run.tenant_id
    where source.id = v_run.feed_source_id
      and source.tenant_id = v_run.tenant_id;
  end loop;
end;
$$;

-- A worker refreshes this lease while it is reading or mutating a large feed.
-- The attempt number prevents a stale worker from extending a run reclaimed
-- after a crash.
create or replace function public.heartbeat_inventory_feed_run(
  p_run_id uuid,
  p_attempt_count integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
begin
  select run.tenant_id
  into v_tenant_id
  from public.inventory_feed_runs run
  where run.id = p_run_id
    and run.status = 'processing'
    and run.attempt_count = p_attempt_count
  for update;

  if not found then
    return false;
  end if;

  update public.inventory_feed_tenant_leases lease
  set claimed_at = now()
  where lease.tenant_id = v_tenant_id
    and lease.run_id = p_run_id;
  if not found then
    return false;
  end if;

  update public.inventory_feed_runs run
  set updated_at = now()
  where run.id = p_run_id
    and run.tenant_id = v_tenant_id
    and run.status = 'processing'
    and run.attempt_count = p_attempt_count;

  return found;
end;
$$;

create or replace function public.complete_inventory_feed_run(
  p_run_id uuid,
  p_attempt_count integer,
  p_status text,
  p_source_hash text,
  p_input_bytes bigint,
  p_total_rows integer,
  p_processed_rows integer,
  p_created_rows integer,
  p_updated_rows integer,
  p_skipped_rows integer,
  p_conflict_rows integer,
  p_failed_rows integer,
  p_errors jsonb default '[]'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source_id uuid;
  v_tenant_id uuid;
  v_config_version integer;
  v_errors jsonb := coalesce(p_errors, '[]'::jsonb);
begin
  if p_status not in ('succeeded', 'partial', 'skipped') then
    raise exception 'Invalid inventory feed completion status: %', p_status
      using errcode = '22023';
  end if;
  if p_source_hash is not null and p_source_hash !~* '^[0-9a-f]{64}$' then
    raise exception 'Inventory feed source hash must be a SHA-256 hex digest'
      using errcode = '22023';
  end if;
  if jsonb_typeof(v_errors) <> 'array' or jsonb_array_length(v_errors) > 100 then
    raise exception 'Inventory feed errors must be an array of at most 100 entries'
      using errcode = '22023';
  end if;

  select run.feed_source_id, run.tenant_id,
    nullif(run.source_snapshot ->> 'configVersion', '')::integer
  into v_source_id, v_tenant_id, v_config_version
  from public.inventory_feed_runs run
  where run.id = p_run_id
    and run.status = 'processing'
    and run.attempt_count = p_attempt_count
  for update;

  if not found then
    return false;
  end if;

  update public.inventory_feed_runs
  set
    status = p_status,
    source_hash = p_source_hash,
    input_bytes = p_input_bytes,
    total_rows = p_total_rows,
    processed_rows = p_processed_rows,
    created_rows = p_created_rows,
    updated_rows = p_updated_rows,
    skipped_rows = p_skipped_rows,
    conflict_rows = p_conflict_rows,
    failed_rows = p_failed_rows,
    errors = v_errors,
    last_error = null,
    completed_at = now()
  where id = p_run_id;

  update public.inventory_feed_sources source
  set
    last_attempt_at = case
      when source.config_version = v_config_version then now()
      else source.last_attempt_at
    end,
    last_succeeded_at = case
      when p_status = 'succeeded' and source.config_version = v_config_version then now()
      else source.last_succeeded_at
    end,
    last_source_hash = case
      -- A partial result must always be eligible for recovery, even if an
      -- earlier clean run happened to have identical bytes.
      when p_status = 'partial'
        and source.config_version = v_config_version
        then null
      when p_status = 'succeeded'
        and source.config_version = v_config_version
        then coalesce(p_source_hash, source.last_source_hash)
      else source.last_source_hash
    end,
    consecutive_failure_count = case
      when p_status in ('succeeded', 'skipped') and source.config_version = v_config_version then 0
      else source.consecutive_failure_count
    end,
    -- Partial runs are not silent successes: preserve the last clean success
    -- and make source health visibly degraded until a full run completes.
    last_error = case
      when source.config_version is distinct from v_config_version then source.last_error
      when p_status = 'partial' then 'Managed feed completed with partial results. Review run history.'
      else null
    end
  where source.id = v_source_id and source.tenant_id = v_tenant_id;

  delete from public.inventory_feed_tenant_leases lease
  where lease.tenant_id = v_tenant_id
    and lease.run_id = p_run_id;

  return true;
end;
$$;

create or replace function public.fail_inventory_feed_run(
  p_run_id uuid,
  p_attempt_count integer,
  p_next_attempt_at timestamptz,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source_id uuid;
  v_tenant_id uuid;
  v_attempt_count integer;
  v_config_version integer;
  v_retry_allowed boolean;
  v_dead_letter boolean;
  v_error text := left(coalesce(nullif(btrim(p_error), ''), 'Inventory feed run failed.'), 500);
begin
  select run.feed_source_id, run.tenant_id, run.attempt_count,
    nullif(run.source_snapshot ->> 'configVersion', '')::integer
  into v_source_id, v_tenant_id, v_attempt_count, v_config_version
  from public.inventory_feed_runs run
  where run.id = p_run_id
    and run.status = 'processing'
    and run.attempt_count = p_attempt_count
  for update;

  if not found then
    return false;
  end if;

  select exists (
    select 1
    from public.inventory_feed_sources source
    where source.id = v_source_id
      and source.tenant_id = v_tenant_id
      and source.enabled = true
      and source.archived_at is null
      and source.config_version = v_config_version
  ) into v_retry_allowed;

  v_dead_letter := p_next_attempt_at is null or v_attempt_count >= 10 or not v_retry_allowed;

  update public.inventory_feed_runs
  set
    status = case
      when not v_retry_allowed then 'cancelled'
      when v_dead_letter then 'dead_letter'
      else 'retrying'
    end,
    next_attempt_at = case
      when v_dead_letter then next_attempt_at
      else greatest(p_next_attempt_at, now())
    end,
    last_error = case
      when not v_retry_allowed then 'Managed inventory source changed or was disabled before this run could retry.'
      else v_error
    end,
    completed_at = case when v_dead_letter then now() else completed_at end
  where id = p_run_id;

  update public.inventory_feed_sources source
  set
    last_attempt_at = now(),
    consecutive_failure_count = source.consecutive_failure_count + 1,
    last_error = v_error
  where source.id = v_source_id
    and source.tenant_id = v_tenant_id
    and source.config_version = v_config_version;

  -- A retry is not processing until its next claim, so release the tenant for
  -- another independent source while preserving this run's backoff schedule.
  delete from public.inventory_feed_tenant_leases lease
  where lease.tenant_id = v_tenant_id
    and lease.run_id = p_run_id;

  return true;
end;
$$;

-- ─── Service-only destination configuration and durable export queue ───────

create or replace function public.create_inventory_export_destination(
  p_tenant_id uuid,
  p_name text,
  p_endpoint_url text,
  p_http_method text,
  p_export_format text,
  p_profile jsonb,
  p_schedule_minutes integer,
  p_retry_delays_seconds integer[],
  p_enabled boolean,
  p_credential_ciphertext text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into public.inventory_export_destinations (
    tenant_id, name, endpoint_url, http_method, export_format, profile,
    schedule_minutes, retry_delays_seconds, enabled, next_scheduled_at
  ) values (
    p_tenant_id, p_name, p_endpoint_url, p_http_method, p_export_format,
    p_profile, p_schedule_minutes, p_retry_delays_seconds, p_enabled,
    case when p_enabled and p_schedule_minutes is not null then now() else null end
  )
  returning id into v_id;

  if p_credential_ciphertext is not null then
    insert into public.inventory_export_destination_credentials (
      export_destination_id, tenant_id, credential_ciphertext
    ) values (
      v_id, p_tenant_id, p_credential_ciphertext
    );
  end if;

  return v_id;
end;
$$;

create or replace function public.update_inventory_export_destination(
  p_export_destination_id uuid,
  p_tenant_id uuid,
  p_name text,
  p_endpoint_url text,
  p_http_method text,
  p_export_format text,
  p_profile jsonb,
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
  -- Do not let a queued old endpoint inherit a newly rotated credential. A
  -- delivery already in progress has its credential in memory, so edits wait
  -- for that side effect to finish before changing configuration.
  select destination.id
  into v_id
  from public.inventory_export_destinations destination
  where destination.id = p_export_destination_id
    and destination.tenant_id = p_tenant_id
    and destination.archived_at is null
  for update;

  if v_id is null then
    return false;
  end if;

  if exists (
    select 1
    from public.inventory_export_runs run
    where run.export_destination_id = v_id
      and run.tenant_id = p_tenant_id
      and run.status = 'delivering'
  ) then
    raise exception 'Wait for the active inventory export to finish before updating this destination.'
      using errcode = '55000';
  end if;

  if p_credential_ciphertext is not null and not p_replace_credential then
    raise exception 'p_replace_credential must be true when changing a credential'
      using errcode = '22023';
  end if;

  update public.inventory_export_destinations destination
  set
    name = p_name,
    endpoint_url = p_endpoint_url,
    http_method = p_http_method,
    export_format = p_export_format,
    profile = p_profile,
    config_version = destination.config_version + 1,
    last_payload_hash = null,
    schedule_minutes = p_schedule_minutes,
    retry_delays_seconds = p_retry_delays_seconds,
    enabled = p_enabled,
    next_scheduled_at = case
      when p_enabled and p_schedule_minutes is not null
        then now()
      else null
    end
  where destination.id = v_id
    and destination.tenant_id = p_tenant_id;

  update public.inventory_export_runs run
  set
    status = 'cancelled',
    last_error = 'A newer inventory export destination configuration superseded this queued run.',
    completed_at = now()
  where run.export_destination_id = v_id
    and run.tenant_id = p_tenant_id
    and run.status in ('pending', 'retrying');

  if p_replace_credential then
    if p_credential_ciphertext is null then
      delete from public.inventory_export_destination_credentials credential
      where credential.export_destination_id = v_id
        and credential.tenant_id = p_tenant_id;
    else
      insert into public.inventory_export_destination_credentials (
        export_destination_id, tenant_id, credential_ciphertext
      ) values (
        v_id, p_tenant_id, p_credential_ciphertext
      )
      on conflict (export_destination_id) do update
        set credential_ciphertext = excluded.credential_ciphertext,
            updated_at = now();
    end if;
  end if;

  return true;
end;
$$;

create or replace function public.set_inventory_export_destination_enabled(
  p_export_destination_id uuid,
  p_tenant_id uuid,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_enabled is null then
    raise exception 'Inventory export destination enabled state is required.'
      using errcode = '22023';
  end if;

  select destination.id
  into v_id
  from public.inventory_export_destinations destination
  where destination.id = p_export_destination_id
    and destination.tenant_id = p_tenant_id
    and destination.archived_at is null
  for update;

  if v_id is null then
    return false;
  end if;

  if not p_enabled and exists (
    select 1
    from public.inventory_export_runs run
    where run.export_destination_id = v_id
      and run.tenant_id = p_tenant_id
      and run.status = 'delivering'
  ) then
    raise exception 'Wait for the active inventory export to finish before pausing this destination.'
      using errcode = '55000';
  end if;

  update public.inventory_export_destinations destination
  set
    enabled = p_enabled,
    next_scheduled_at = case
      when p_enabled and destination.schedule_minutes is not null then now()
      else null
    end
  where destination.id = v_id
    and destination.tenant_id = p_tenant_id;

  if not p_enabled then
    update public.inventory_export_runs run
    set
      status = 'cancelled',
      last_error = 'Inventory export destination was paused before this run began.',
      completed_at = now()
    where run.export_destination_id = v_id
      and run.tenant_id = p_tenant_id
      and run.status in ('pending', 'retrying');
  end if;

  return true;
end;
$$;

-- See archive_inventory_feed_source: an active delivery is allowed to finish,
-- while pending/retried work is cancelled and evidence is retained.
create or replace function public.archive_inventory_export_destination(
  p_export_destination_id uuid,
  p_tenant_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  select destination.id
  into v_id
  from public.inventory_export_destinations destination
  where destination.id = p_export_destination_id
    and destination.tenant_id = p_tenant_id
    and destination.archived_at is null
  for update;

  if v_id is null then
    return false;
  end if;

  if exists (
    select 1
    from public.inventory_export_runs run
    where run.export_destination_id = v_id
      and run.tenant_id = p_tenant_id
      and run.status = 'delivering'
  ) then
    raise exception 'Wait for the active inventory export to finish before archiving this destination.'
      using errcode = '55000';
  end if;

  update public.inventory_export_destinations destination
  set
    enabled = false,
    next_scheduled_at = null,
    archived_at = coalesce(destination.archived_at, now())
  where destination.id = v_id
    and destination.tenant_id = p_tenant_id;

  update public.inventory_export_runs run
  set
    status = 'cancelled',
    last_error = 'Inventory export destination was archived.',
    completed_at = now()
  where run.export_destination_id = v_id
    and run.tenant_id = p_tenant_id
    and run.status in ('pending', 'retrying');

  delete from public.inventory_export_destination_credentials credential
  where credential.export_destination_id = v_id
    and credential.tenant_id = p_tenant_id;

  return true;
end;
$$;

create or replace function public.enqueue_inventory_export_run(
  p_export_destination_id uuid,
  p_tenant_id uuid,
  p_run_trigger text default 'manual'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_destination public.inventory_export_destinations%rowtype;
  v_run_id uuid;
begin
  if p_run_trigger not in ('manual', 'scheduled') then
    raise exception 'Invalid inventory export run trigger: %', p_run_trigger
      using errcode = '22023';
  end if;

  select *
  into v_destination
  from public.inventory_export_destinations destination
  where destination.id = p_export_destination_id
    and destination.tenant_id = p_tenant_id
    and destination.enabled = true
    and destination.archived_at is null
  for update;

  if not found then
    return null;
  end if;

  insert into public.inventory_export_runs (
    tenant_id, export_destination_id, run_trigger, destination_snapshot,
    next_attempt_at
  ) values (
    v_destination.tenant_id,
    v_destination.id,
    p_run_trigger,
    jsonb_build_object(
      'endpointUrl', v_destination.endpoint_url,
      'httpMethod', v_destination.http_method,
      'exportFormat', v_destination.export_format,
      'profile', v_destination.profile,
      'configVersion', v_destination.config_version,
      'retryDelaysSeconds', v_destination.retry_delays_seconds
    ),
    now()
  )
  on conflict (export_destination_id)
    where status in ('pending', 'delivering', 'retrying')
  do update set
    next_attempt_at = least(
      public.inventory_export_runs.next_attempt_at,
      excluded.next_attempt_at
    ),
    updated_at = now()
  returning id into v_run_id;

  update public.inventory_export_destinations
  set last_enqueued_at = now()
  where id = v_destination.id and tenant_id = v_destination.tenant_id;

  return v_run_id;
end;
$$;

create or replace function public.enqueue_due_inventory_export_runs(
  p_limit integer default 25
)
returns table (run_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_destination record;
  v_run_id uuid;
begin
  for v_destination in
    select destination.id, destination.tenant_id, destination.schedule_minutes
    from public.inventory_export_destinations destination
    where destination.enabled = true
      and destination.archived_at is null
      and destination.schedule_minutes is not null
      and destination.next_scheduled_at <= now()
    order by destination.next_scheduled_at, destination.id
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
    for update skip locked
  loop
    update public.inventory_export_destinations destination
    set next_scheduled_at = now()
      + make_interval(mins => v_destination.schedule_minutes)
    where destination.id = v_destination.id;

    v_run_id := public.enqueue_inventory_export_run(v_destination.id, v_destination.tenant_id, 'scheduled');
    if v_run_id is not null then
      run_id := v_run_id;
      return next;
    end if;
  end loop;
end;
$$;

create or replace function public.claim_inventory_export_runs(
  p_limit integer default 25
)
returns table (
  id uuid,
  tenant_id uuid,
  export_destination_id uuid,
  run_trigger text,
  destination_snapshot jsonb,
  attempt_count integer,
  credential_ciphertext text,
  retry_delays_seconds integer[],
  last_payload_hash text,
  destination_config_version integer
)
language sql
security definer
set search_path = public, pg_temp
as $$
  with due as (
    select run.id
    from public.inventory_export_runs run
    join public.inventory_export_destinations destination
      on destination.id = run.export_destination_id
      and destination.tenant_id = run.tenant_id
    where destination.enabled = true
      and destination.archived_at is null
      and (
        (run.status in ('pending', 'retrying') and run.next_attempt_at <= now())
        or (
          run.status = 'delivering'
          and run.updated_at <= now() - interval '15 minutes'
        )
    )
    order by run.next_attempt_at, run.id
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
    -- Lock the destination as well as the queued run. Configuration changes,
    -- pause, and archive operations lock this same destination before they
    -- cancel pending work, so an old snapshot cannot slip into `delivering`
    -- after one of those control actions has succeeded.
    for update of run, destination skip locked
  ), claimed as (
    update public.inventory_export_runs run
    set
      status = 'delivering',
      attempt_count = run.attempt_count + 1,
      claimed_at = now(),
      started_at = coalesce(run.started_at, now()),
      last_error = null
    from due
    where run.id = due.id
    returning run.*
  )
  select
    claimed.id,
    claimed.tenant_id,
    claimed.export_destination_id,
    claimed.run_trigger,
    claimed.destination_snapshot,
    claimed.attempt_count,
    credential.credential_ciphertext,
    coalesce(
      (
        select array_agg(retry_delay.value::integer order by retry_delay.ordinality)
        from jsonb_array_elements_text(
          claimed.destination_snapshot -> 'retryDelaysSeconds'
        ) with ordinality as retry_delay(value, ordinality)
      ),
      destination.retry_delays_seconds
    ),
    destination.last_payload_hash,
    destination.config_version
  from claimed
  join public.inventory_export_destinations destination
    on destination.id = claimed.export_destination_id
    and destination.tenant_id = claimed.tenant_id
  left join public.inventory_export_destination_credentials credential
    on credential.export_destination_id = claimed.export_destination_id
    and credential.tenant_id = claimed.tenant_id;
$$;

create or replace function public.complete_inventory_export_run(
  p_run_id uuid,
  p_attempt_count integer,
  p_status text,
  p_payload_hash text,
  p_record_count integer,
  p_response_status integer default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_destination_id uuid;
  v_tenant_id uuid;
  v_config_version integer;
begin
  if p_status not in ('succeeded', 'skipped') then
    raise exception 'Invalid inventory export completion status: %', p_status
      using errcode = '22023';
  end if;
  if p_payload_hash is null or p_payload_hash !~* '^[0-9a-f]{64}$' then
    raise exception 'Inventory export payload hash must be a SHA-256 hex digest'
      using errcode = '22023';
  end if;
  if p_response_status is not null
    and p_response_status not between 100 and 599 then
    raise exception 'Invalid inventory export response status: %', p_response_status
      using errcode = '22023';
  end if;

  select run.export_destination_id, run.tenant_id,
    nullif(run.destination_snapshot ->> 'configVersion', '')::integer
  into v_destination_id, v_tenant_id, v_config_version
  from public.inventory_export_runs run
  where run.id = p_run_id
    and run.status = 'delivering'
    and run.attempt_count = p_attempt_count
  for update;

  if not found then
    return false;
  end if;

  update public.inventory_export_runs
  set
    status = p_status,
    payload_hash = p_payload_hash,
    record_count = p_record_count,
    response_status = p_response_status,
    last_error = null,
    completed_at = now()
  where id = p_run_id;

  update public.inventory_export_destinations destination
  set
    last_attempt_at = case
      when destination.config_version = v_config_version then now()
      else destination.last_attempt_at
    end,
    last_succeeded_at = case
      when p_status = 'succeeded' and destination.config_version = v_config_version then now()
      else destination.last_succeeded_at
    end,
    last_noop_at = case
      when p_status = 'skipped' and destination.config_version = v_config_version then now()
      else destination.last_noop_at
    end,
    last_payload_hash = case
      when destination.config_version = v_config_version then p_payload_hash
      else destination.last_payload_hash
    end,
    consecutive_failure_count = case
      when destination.config_version = v_config_version then 0
      else destination.consecutive_failure_count
    end,
    last_error = case
      when destination.config_version = v_config_version then null
      else destination.last_error
    end
  where destination.id = v_destination_id and destination.tenant_id = v_tenant_id;

  return true;
end;
$$;

create or replace function public.fail_inventory_export_run(
  p_run_id uuid,
  p_attempt_count integer,
  p_next_attempt_at timestamptz,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_destination_id uuid;
  v_tenant_id uuid;
  v_attempt_count integer;
  v_config_version integer;
  v_retry_allowed boolean;
  v_dead_letter boolean;
  v_error text := left(coalesce(nullif(btrim(p_error), ''), 'Inventory export run failed.'), 500);
begin
  select run.export_destination_id, run.tenant_id, run.attempt_count,
    nullif(run.destination_snapshot ->> 'configVersion', '')::integer
  into v_destination_id, v_tenant_id, v_attempt_count, v_config_version
  from public.inventory_export_runs run
  where run.id = p_run_id
    and run.status = 'delivering'
    and run.attempt_count = p_attempt_count
  for update;

  if not found then
    return false;
  end if;

  select exists (
    select 1
    from public.inventory_export_destinations destination
    where destination.id = v_destination_id
      and destination.tenant_id = v_tenant_id
      and destination.enabled = true
      and destination.archived_at is null
      and destination.config_version = v_config_version
  ) into v_retry_allowed;

  v_dead_letter := p_next_attempt_at is null or v_attempt_count >= 10 or not v_retry_allowed;

  update public.inventory_export_runs
  set
    status = case
      when not v_retry_allowed then 'cancelled'
      when v_dead_letter then 'dead_letter'
      else 'retrying'
    end,
    next_attempt_at = case
      when v_dead_letter then next_attempt_at
      else greatest(p_next_attempt_at, now())
    end,
    last_error = case
      when not v_retry_allowed then 'Inventory export destination changed or was disabled before this run could retry.'
      else v_error
    end,
    completed_at = case when v_dead_letter then now() else completed_at end
  where id = p_run_id;

  update public.inventory_export_destinations destination
  set
    last_attempt_at = now(),
    consecutive_failure_count = destination.consecutive_failure_count + 1,
    last_error = v_error
  where destination.id = v_destination_id
    and destination.tenant_id = v_tenant_id
    and destination.config_version = v_config_version;

  return true;
end;
$$;

-- All mutating queue/config functions are service-role-only. Supabase grants
-- EXECUTE to PUBLIC by default, so revoke it explicitly before granting the
-- trusted worker/API role.
revoke all on function public.create_inventory_feed_source(
  uuid, text, text, text, text, text, jsonb, text, integer, integer[], boolean, text
) from public, anon, authenticated;
revoke all on function public.update_inventory_feed_source(
  uuid, uuid, text, text, text, text, text, jsonb, text, integer, integer[], boolean, text, boolean
) from public, anon, authenticated;
revoke all on function public.set_inventory_feed_source_enabled(uuid, uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.archive_inventory_feed_source(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.enqueue_inventory_feed_run(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.enqueue_due_inventory_feed_runs(integer)
  from public, anon, authenticated;
revoke all on function public.claim_inventory_feed_runs(integer)
  from public, anon, authenticated;
revoke all on function public.heartbeat_inventory_feed_run(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.complete_inventory_feed_run(
  uuid, integer, text, text, bigint, integer, integer, integer, integer,
  integer, integer, integer, jsonb
) from public, anon, authenticated;
revoke all on function public.fail_inventory_feed_run(uuid, integer, timestamptz, text)
  from public, anon, authenticated;
revoke all on function public.create_inventory_export_destination(
  uuid, text, text, text, text, jsonb, integer, integer[], boolean, text
) from public, anon, authenticated;
revoke all on function public.update_inventory_export_destination(
  uuid, uuid, text, text, text, text, jsonb, integer, integer[], boolean, text, boolean
) from public, anon, authenticated;
revoke all on function public.set_inventory_export_destination_enabled(uuid, uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.archive_inventory_export_destination(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.enqueue_inventory_export_run(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.enqueue_due_inventory_export_runs(integer)
  from public, anon, authenticated;
revoke all on function public.claim_inventory_export_runs(integer)
  from public, anon, authenticated;
revoke all on function public.complete_inventory_export_run(
  uuid, integer, text, text, integer, integer
) from public, anon, authenticated;
revoke all on function public.fail_inventory_export_run(uuid, integer, timestamptz, text)
  from public, anon, authenticated;

grant execute on function public.create_inventory_feed_source(
  uuid, text, text, text, text, text, jsonb, text, integer, integer[], boolean, text
) to service_role;
grant execute on function public.update_inventory_feed_source(
  uuid, uuid, text, text, text, text, text, jsonb, text, integer, integer[], boolean, text, boolean
) to service_role;
grant execute on function public.set_inventory_feed_source_enabled(uuid, uuid, boolean)
  to service_role;
grant execute on function public.archive_inventory_feed_source(uuid, uuid)
  to service_role;
grant execute on function public.enqueue_inventory_feed_run(uuid, uuid, text)
  to service_role;
grant execute on function public.enqueue_due_inventory_feed_runs(integer)
  to service_role;
grant execute on function public.claim_inventory_feed_runs(integer)
  to service_role;
grant execute on function public.heartbeat_inventory_feed_run(uuid, integer)
  to service_role;
grant execute on function public.complete_inventory_feed_run(
  uuid, integer, text, text, bigint, integer, integer, integer, integer,
  integer, integer, integer, jsonb
) to service_role;
grant execute on function public.fail_inventory_feed_run(uuid, integer, timestamptz, text)
  to service_role;
grant execute on function public.create_inventory_export_destination(
  uuid, text, text, text, text, jsonb, integer, integer[], boolean, text
) to service_role;
grant execute on function public.update_inventory_export_destination(
  uuid, uuid, text, text, text, text, jsonb, integer, integer[], boolean, text, boolean
) to service_role;
grant execute on function public.set_inventory_export_destination_enabled(uuid, uuid, boolean)
  to service_role;
grant execute on function public.archive_inventory_export_destination(uuid, uuid)
  to service_role;
grant execute on function public.enqueue_inventory_export_run(uuid, uuid, text)
  to service_role;
grant execute on function public.enqueue_due_inventory_export_runs(integer)
  to service_role;
grant execute on function public.claim_inventory_export_runs(integer)
  to service_role;
grant execute on function public.complete_inventory_export_run(
  uuid, integer, text, text, integer, integer
) to service_role;
grant execute on function public.fail_inventory_export_run(uuid, integer, timestamptz, text)
  to service_role;

comment on table public.inventory_feed_source_credentials is
  'Opaque encrypted inventory-feed credentials. RLS deny-all; service-role access only.';
comment on table public.inventory_export_destination_credentials is
  'Opaque encrypted inventory-export credentials. RLS deny-all; service-role access only.';
comment on table public.inventory_feed_runs is
  'Durable, tenant-scoped inbound sync queue. Workers claim with a lease and never delete/recreate inventory records.';
comment on table public.inventory_export_runs is
  'Durable, tenant-scoped outbound export queue. Payload hashes support semantic no-op suppression.';
