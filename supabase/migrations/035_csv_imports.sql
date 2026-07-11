-- 035_csv_imports.sql
-- SCRUM-162. Durable lifecycle and progress metadata for tenant CSV imports.
-- The importer may run in-process today; source_object_path leaves a safe
-- extension point for a future private-storage/background worker.

create table if not exists public.csv_imports (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  import_type text not null default 'vehicle_inventory'
    check (import_type in ('vehicle_inventory')),
  mode text not null default 'add'
    check (mode in ('add', 'replace')),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'succeeded', 'failed', 'partial')),
  source_file_name text not null check (char_length(source_file_name) between 1 and 512),
  source_object_path text check (
    source_object_path is null or char_length(source_object_path) between 1 and 2048
  ),
  total_rows integer not null default 0 check (total_rows >= 0),
  processed_rows integer not null default 0 check (processed_rows >= 0),
  succeeded_rows integer not null default 0 check (succeeded_rows >= 0),
  failed_rows integer not null default 0 check (failed_rows >= 0),
  skipped_rows integer not null default 0 check (skipped_rows >= 0),
  errors jsonb not null default '[]'::jsonb check (jsonb_typeof(errors) = 'array'),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint csv_imports_processed_within_total check (processed_rows <= total_rows),
  constraint csv_imports_count_consistency check (
    processed_rows = succeeded_rows + failed_rows + skipped_rows
  ),
  constraint csv_imports_completion_order check (
    completed_at is null or started_at is null or completed_at >= started_at
  )
);

create index if not exists csv_imports_tenant_created_idx
  on public.csv_imports (tenant_id, created_at desc);
create index if not exists csv_imports_status_created_idx
  on public.csv_imports (status, created_at)
  where status in ('pending', 'running');

alter table public.csv_imports enable row level security;

create policy "csv_imports_select_member" on public.csv_imports
  for select to authenticated
  using (tenant_id in (select public.tenant_ids_for_current_user()));

create policy "csv_imports_write_editor" on public.csv_imports
  for all to authenticated
  using (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']))
  with check (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']));

create trigger csv_imports_set_updated_at
  before update on public.csv_imports
  for each row execute function public.set_updated_at();

comment on table public.csv_imports is
  'Tenant-scoped CSV import lifecycle, counters, and bounded diagnostic metadata.';
