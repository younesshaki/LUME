-- 048_tenant_storage_quota.sql
-- SCRUM-163. Complete daily tenant storage snapshots, cross-provider upload
-- reservations, and an additive restrictive policy for Supabase Storage.

create table if not exists public.tenant_storage_usage (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  captured_on date not null default current_date,
  captured_at timestamptz not null default now(),
  total_bytes bigint not null,
  supabase_bytes bigint not null,
  r2_bytes bigint not null,
  total_object_count bigint not null,
  supabase_object_count bigint not null,
  r2_object_count bigint not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, captured_on),
  constraint tenant_storage_usage_bytes_nonnegative check (
    total_bytes >= 0 and supabase_bytes >= 0 and r2_bytes >= 0
  ),
  constraint tenant_storage_usage_bytes_sum check (
    total_bytes = supabase_bytes + r2_bytes
  ),
  constraint tenant_storage_usage_objects_nonnegative check (
    total_object_count >= 0
    and supabase_object_count >= 0
    and r2_object_count >= 0
  ),
  constraint tenant_storage_usage_objects_sum check (
    total_object_count = supabase_object_count + r2_object_count
  ),
  constraint tenant_storage_usage_metadata_object check (
    jsonb_typeof(metadata) = 'object'
  )
);

create index if not exists tenant_storage_usage_latest_idx
  on public.tenant_storage_usage (tenant_id, captured_at desc);

create table if not exists public.storage_upload_reservations (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  reservation_key text not null unique,
  byte_size bigint not null check (byte_size > 0),
  upload_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint storage_upload_reservation_key_bounded check (
    char_length(reservation_key) between 1 and 1024
  )
);

create index if not exists storage_upload_reservations_tenant_idx
  on public.storage_upload_reservations (tenant_id, created_at);
create index if not exists storage_upload_reservations_expiry_idx
  on public.storage_upload_reservations (upload_expires_at);

alter table public.tenant_storage_usage enable row level security;
alter table public.storage_upload_reservations enable row level security;

create policy "tenant_storage_usage_select_member" on public.tenant_storage_usage
  for select to authenticated
  using (tenant_id in (select public.tenant_ids_for_current_user()));

-- Reservations are an internal accounting primitive. No client policies are
-- created; trusted server RPCs are the only writer/reader.

create trigger tenant_storage_usage_set_updated_at
  before update on public.tenant_storage_usage
  for each row execute function public.set_updated_at();

alter table public.admin_notifications
  add column if not exists dedupe_key text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_notifications_dedupe_key_bounded'
      and conrelid = 'public.admin_notifications'::regclass
  ) then
    alter table public.admin_notifications
      add constraint admin_notifications_dedupe_key_bounded check (
        dedupe_key is null or char_length(dedupe_key) between 1 and 200
      );
  end if;
end;
$$;

create unique index if not exists admin_notifications_tenant_dedupe_idx
  on public.admin_notifications (tenant_id, dedupe_key)
  where dedupe_key is not null;

create or replace function public.storage_object_size_bytes(p_metadata jsonb)
returns bigint
language plpgsql
immutable
set search_path = ''
as $$
declare
  size_text text;
begin
  size_text := coalesce(p_metadata ->> 'size', p_metadata ->> 'contentLength');
  if size_text is null or size_text !~ '^[0-9]{1,18}$' then
    return null;
  end if;
  return size_text::bigint;
exception when numeric_value_out_of_range then
  return null;
end;
$$;

create or replace function public.measure_tenant_supabase_storage(p_tenant_id uuid)
returns table (
  bucket_id text,
  bytes bigint,
  object_count bigint,
  invalid_object_count bigint
)
language sql
security definer
set search_path = ''
as $$
  with known_buckets(bucket_id) as (
    values
      ('tenant-logos'::text),
      ('tenant-media'::text),
      ('tenant-csvs'::text),
      ('tenant-3d-models'::text)
  ), tenant_objects as (
    select
      object.bucket_id,
      public.storage_object_size_bytes(object.metadata) as byte_size
    from storage.objects object
    where object.bucket_id in (
      'tenant-logos',
      'tenant-media',
      'tenant-csvs',
      'tenant-3d-models'
    )
      and (storage.foldername(object.name))[1] = p_tenant_id::text
  )
  select
    bucket.bucket_id,
    coalesce(sum(object.byte_size) filter (where object.byte_size is not null), 0)::bigint,
    count(object.bucket_id)::bigint,
    count(object.bucket_id) filter (where object.byte_size is null)::bigint
  from known_buckets bucket
  left join tenant_objects object on object.bucket_id = bucket.bucket_id
  group by bucket.bucket_id
  order by bucket.bucket_id;
$$;

create or replace function public.tenant_storage_limit_bytes(p_tenant_id uuid)
returns bigint
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  limit_text text;
begin
  select plan.limits ->> 'storage_bytes'
  into limit_text
  from public.subscriptions subscription
  join public.plans plan on plan.id = subscription.plan_id
  where subscription.tenant_id = p_tenant_id
    and subscription.status in ('active', 'trialing', 'past_due', 'incomplete')
  order by
    case subscription.status
      when 'active' then 0
      when 'trialing' then 1
      when 'past_due' then 2
      else 3
    end,
    subscription.created_at desc
  limit 1;

  if limit_text is null or limit_text !~ '^-?[0-9]{1,18}$' then
    return null;
  end if;
  return limit_text::bigint;
exception when numeric_value_out_of_range then
  return null;
end;
$$;

create or replace function public.reserve_tenant_storage_upload(
  p_tenant_id uuid,
  p_reservation_key text,
  p_byte_size bigint,
  p_upload_expires_at timestamptz
)
returns table (
  allowed boolean,
  reason text,
  current_bytes bigint,
  projected_bytes bigint,
  limit_bytes bigint,
  warning boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  storage_limit bigint;
  snapshot_r2_bytes bigint;
  snapshot_captured_at timestamptz;
  supabase_bytes bigint;
  invalid_objects bigint;
  reserved_bytes bigint;
  current_total bigint;
  projected_total bigint;
  existing_reservation public.storage_upload_reservations%rowtype;
  reservation_exists boolean := false;
begin
  if p_tenant_id is null
    or p_reservation_key is null
    or char_length(p_reservation_key) not between 1 and 1024
    or p_byte_size is null
    or p_byte_size <= 0
    or p_upload_expires_at is null
    or p_upload_expires_at <= now()
    or p_upload_expires_at > now() + interval '15 minutes'
  then
    raise exception 'Invalid storage upload reservation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 0));

  storage_limit := public.tenant_storage_limit_bytes(p_tenant_id);
  if storage_limit is null then
    return query select true, 'unconfigured'::text, null::bigint, null::bigint, null::bigint, false;
    return;
  end if;
  if storage_limit < 0 then
    return query select true, 'unlimited'::text, null::bigint, null::bigint, storage_limit, false;
    return;
  end if;

  select usage.r2_bytes, usage.captured_at
  into snapshot_r2_bytes, snapshot_captured_at
  from public.tenant_storage_usage usage
  where usage.tenant_id = p_tenant_id
  order by usage.captured_at desc
  limit 1;
  if snapshot_captured_at is null or snapshot_captured_at < now() - interval '48 hours' then
    return query select true, 'stale_snapshot'::text, null::bigint, null::bigint, storage_limit, false;
    return;
  end if;

  select coalesce(sum(measurement.bytes), 0), coalesce(sum(measurement.invalid_object_count), 0)
  into supabase_bytes, invalid_objects
  from public.measure_tenant_supabase_storage(p_tenant_id) measurement;
  if invalid_objects > 0 then
    return query select true, 'measurement_unavailable'::text, null::bigint, null::bigint, storage_limit, false;
    return;
  end if;

  select reservation.*
  into existing_reservation
  from public.storage_upload_reservations reservation
  where reservation.reservation_key = p_reservation_key;
  reservation_exists := found;
  if reservation_exists and (
    existing_reservation.tenant_id <> p_tenant_id
    or existing_reservation.byte_size <> p_byte_size
  ) then
    raise exception 'Storage reservation key collision';
  end if;

  select coalesce(sum(reservation.byte_size), 0)
  into reserved_bytes
  from public.storage_upload_reservations reservation
  where reservation.tenant_id = p_tenant_id;

  current_total := snapshot_r2_bytes + supabase_bytes + reserved_bytes;
  projected_total := case
    when reservation_exists then current_total
    else current_total + p_byte_size
  end;
  if projected_total > storage_limit then
    return query select false, 'quota_exceeded'::text, current_total, projected_total, storage_limit, false;
    return;
  end if;

  if not reservation_exists then
    insert into public.storage_upload_reservations (
      tenant_id,
      reservation_key,
      byte_size,
      upload_expires_at
    ) values (
      p_tenant_id,
      p_reservation_key,
      p_byte_size,
      p_upload_expires_at
    );
  end if;

  return query select
    true,
    'within_limit'::text,
    current_total,
    projected_total,
    storage_limit,
    storage_limit > 0
      and projected_total >= storage_limit - (storage_limit / 5);
end;
$$;

create or replace function public.tenant_storage_upload_allowed(
  p_tenant_id_text text,
  p_bucket_id text,
  p_object_name text,
  p_candidate_bytes_text text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  tenant_uuid uuid;
  candidate_bytes bigint;
  storage_limit bigint;
  snapshot_r2_bytes bigint;
  snapshot_captured_at timestamptz;
  supabase_bytes bigint;
  invalid_objects bigint;
  existing_bytes bigint := 0;
  reserved_bytes bigint;
  projected_total bigint;
begin
  if p_tenant_id_text is null
    or p_tenant_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_bucket_id not in ('tenant-logos', 'tenant-media', 'tenant-csvs', 'tenant-3d-models')
    or p_object_name is null
    or (storage.foldername(p_object_name))[1] <> p_tenant_id_text
    or p_candidate_bytes_text is null
    or p_candidate_bytes_text !~ '^[0-9]{1,18}$'
  then
    return false;
  end if;
  tenant_uuid := p_tenant_id_text::uuid;
  candidate_bytes := p_candidate_bytes_text::bigint;

  if not exists (
    select 1
    from public.tenant_members member
    where member.tenant_id = tenant_uuid
      and member.user_id = auth.uid()
      and member.role in ('owner', 'admin', 'editor')
  ) then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(tenant_uuid::text, 0));
  storage_limit := public.tenant_storage_limit_bytes(tenant_uuid);
  if storage_limit is null or storage_limit < 0 then
    return true;
  end if;

  select usage.r2_bytes, usage.captured_at
  into snapshot_r2_bytes, snapshot_captured_at
  from public.tenant_storage_usage usage
  where usage.tenant_id = tenant_uuid
  order by usage.captured_at desc
  limit 1;
  if snapshot_captured_at is null or snapshot_captured_at < now() - interval '48 hours' then
    return true;
  end if;

  select coalesce(sum(measurement.bytes), 0), coalesce(sum(measurement.invalid_object_count), 0)
  into supabase_bytes, invalid_objects
  from public.measure_tenant_supabase_storage(tenant_uuid) measurement;
  if invalid_objects > 0 then
    return true;
  end if;

  select public.storage_object_size_bytes(object.metadata)
  into existing_bytes
  from storage.objects object
  where object.bucket_id = p_bucket_id
    and object.name = p_object_name;
  existing_bytes := coalesce(existing_bytes, 0);

  select coalesce(sum(reservation.byte_size), 0)
  into reserved_bytes
  from public.storage_upload_reservations reservation
  where reservation.tenant_id = tenant_uuid;

  projected_total := snapshot_r2_bytes
    + supabase_bytes
    - existing_bytes
    + candidate_bytes
    + reserved_bytes;
  return projected_total <= storage_limit;
exception
  when numeric_value_out_of_range then return false;
end;
$$;

-- Existing tenant bucket policies are permissive. These new restrictive
-- policies are ANDed with them, making the quota predicate authoritative
-- without dropping or rewriting migration 013's membership policies.
create policy "tenant_storage_quota_insert_restrictive" on storage.objects
  as restrictive
  for insert to authenticated
  with check (
    bucket_id not in ('tenant-logos', 'tenant-media', 'tenant-csvs', 'tenant-3d-models')
    or public.tenant_storage_upload_allowed(
      (storage.foldername(name))[1],
      bucket_id,
      name,
      coalesce(metadata ->> 'size', metadata ->> 'contentLength')
    )
  );

create policy "tenant_storage_quota_update_restrictive" on storage.objects
  as restrictive
  for update to authenticated
  using (true)
  with check (
    bucket_id not in ('tenant-logos', 'tenant-media', 'tenant-csvs', 'tenant-3d-models')
    or public.tenant_storage_upload_allowed(
      (storage.foldername(name))[1],
      bucket_id,
      name,
      coalesce(metadata ->> 'size', metadata ->> 'contentLength')
    )
  );

revoke all on function public.storage_object_size_bytes(jsonb)
  from public, anon, authenticated;
revoke all on function public.measure_tenant_supabase_storage(uuid)
  from public, anon, authenticated;
revoke all on function public.tenant_storage_limit_bytes(uuid)
  from public, anon, authenticated;
revoke all on function public.reserve_tenant_storage_upload(uuid, text, bigint, timestamptz)
  from public, anon, authenticated;
revoke all on function public.tenant_storage_upload_allowed(text, text, text, text)
  from public, anon, authenticated;

grant execute on function public.measure_tenant_supabase_storage(uuid) to service_role;
grant execute on function public.reserve_tenant_storage_upload(uuid, text, bigint, timestamptz)
  to service_role;
grant execute on function public.tenant_storage_upload_allowed(text, text, text, text)
  to authenticated;

comment on table public.tenant_storage_usage is
  'Complete daily tenant byte/object snapshots across Supabase Storage and R2.';
comment on table public.storage_upload_reservations is
  'Conservative R2 byte reservations retained until a complete provider reconciliation.';
