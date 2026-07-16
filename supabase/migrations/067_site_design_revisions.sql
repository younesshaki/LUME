-- 066_site_design_revisions.sql
-- Website Templates v1 / foundation. Durable, tenant-scoped rollback history for
-- published website designs. Each row is a snapshot of the design document that
-- was REPLACED at publish time, so the previous look can always be restored.
--
-- Writes happen only through the trusted server publish operation (service-role).
-- Members may READ their own tenant's revisions; there is deliberately no client
-- INSERT/UPDATE/DELETE policy. Additive migration; nothing else is altered.

create table if not exists public.site_design_revisions (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- The design document that was active BEFORE this publish (the restore target).
  design jsonb not null check (jsonb_typeof(design) = 'object'),
  template_key text not null,
  template_version integer not null,
  -- auth.users id of the owner/admin who published (nullable-safe if the actor
  -- is later deleted; history text remains meaningful).
  published_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists site_design_revisions_tenant_created_idx
  on public.site_design_revisions (tenant_id, created_at desc);

alter table public.site_design_revisions enable row level security;

-- Members of the tenant can read its design history (for a future restore UI).
drop policy if exists "site_design_revisions_select_member" on public.site_design_revisions;
create policy "site_design_revisions_select_member" on public.site_design_revisions
  for select to authenticated
  using (tenant_id in (select public.tenant_ids_for_current_user()));

-- No INSERT/UPDATE/DELETE policies: revisions are written only by the
-- service-role publish operation, which bypasses RLS. This keeps history
-- append-only and untamperable from the browser.

comment on table public.site_design_revisions is
  'Append-only pre-publish snapshots of tenant website design documents for rollback. Written only by the trusted server publish op; members read their own tenant history.';
