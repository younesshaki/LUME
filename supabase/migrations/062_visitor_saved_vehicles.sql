-- 062_visitor_saved_vehicles.sql
-- Conversion Engine v1 / Phase 2. Authenticated visitor wishlists are private
-- server-managed records. Composite foreign keys enforce tenant consistency so
-- a visitor can never save a vehicle owned by another tenant.

create unique index if not exists vehicles_tenant_id_id_unique_idx
  on public.vehicles (tenant_id, id);

create table if not exists public.visitor_saved_vehicles (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  visitor_id uuid not null,
  vehicle_id uuid not null,
  created_at timestamptz not null default now(),
  constraint visitor_saved_vehicles_tenant_visitor_vehicle_unique
    unique (tenant_id, visitor_id, vehicle_id),
  constraint visitor_saved_vehicles_visitor_tenant_fk
    foreign key (tenant_id, visitor_id)
    references public.visitors(tenant_id, id)
    on delete cascade,
  constraint visitor_saved_vehicles_vehicle_tenant_fk
    foreign key (tenant_id, vehicle_id)
    references public.vehicles(tenant_id, id)
    on delete cascade
);

create index if not exists visitor_saved_vehicles_visitor_created_idx
  on public.visitor_saved_vehicles (tenant_id, visitor_id, created_at desc);
create index if not exists visitor_saved_vehicles_vehicle_created_idx
  on public.visitor_saved_vehicles (tenant_id, vehicle_id, created_at desc);
create index if not exists visitor_saved_vehicles_tenant_created_idx
  on public.visitor_saved_vehicles (tenant_id, created_at desc);

alter table public.visitor_saved_vehicles enable row level security;

drop policy if exists "visitor_saved_vehicles_select_member" on public.visitor_saved_vehicles;
create policy "visitor_saved_vehicles_select_member" on public.visitor_saved_vehicles
  for select to authenticated
  using (tenant_id in (select public.tenant_ids_for_current_user()));

comment on table public.visitor_saved_vehicles is
  'Tenant-consistent, server-managed authenticated visitor vehicle saves. Public browser access is via canonical visitor API only.';
