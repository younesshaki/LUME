-- 057_tenant_asset_antivirus.sql
-- SCRUM-165. Additive scan ledger and private quarantine bucket. The Storage
-- INSERT webhook and Edge Function deployment are provisioned separately.

insert into storage.buckets (id, name, public)
values ('tenant-quarantine', 'tenant-quarantine', false)
on conflict (id) do nothing;

create table if not exists public.tenant_asset_scans (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  bucket_id text not null,
  object_key text not null,
  content_type text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'clean', 'infected', 'error', 'skipped', 'unavailable')),
  scanner text,
  signature text check (signature is null or char_length(signature) <= 500),
  quarantine_key text,
  scanned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_asset_scans_object_unique unique (bucket_id, object_key),
  constraint tenant_asset_scans_key_bounded check (
    char_length(bucket_id) between 1 and 100
    and char_length(object_key) between 1 and 1024
    and (quarantine_key is null or char_length(quarantine_key) <= 1024)
  )
);

create index if not exists tenant_asset_scans_tenant_created_idx
  on public.tenant_asset_scans (tenant_id, created_at desc);
create index if not exists tenant_asset_scans_attention_idx
  on public.tenant_asset_scans (status, updated_at)
  where status in ('infected', 'error', 'unavailable');

alter table public.tenant_asset_scans enable row level security;

create policy "tenant_asset_scans_select_member" on public.tenant_asset_scans
  for select to authenticated
  using (tenant_id in (select public.tenant_ids_for_current_user()));

create trigger tenant_asset_scans_set_updated_at
  before update on public.tenant_asset_scans
  for each row execute function public.set_updated_at();

comment on table public.tenant_asset_scans is
  'Service-written antivirus state for Supabase Storage objects; infected objects move to tenant-quarantine.';
