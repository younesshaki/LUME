-- 061_public_vehicle_inventory.sql
-- A narrow, tenant-scoped public inventory projection with the managed
-- primary image selected in SQL. Also maintains a per-tenant catalog version
-- so HTTP caches can be invalidated after vehicle or image mutations.

create table if not exists public.tenant_inventory_versions (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);

alter table public.tenant_inventory_versions enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tenant_inventory_versions'
      and policyname = 'tenant_inventory_versions_select_public_active'
  ) then
    create policy "tenant_inventory_versions_select_public_active"
      on public.tenant_inventory_versions for select
      using (
        exists (
          select 1 from public.tenants t
          where t.id = tenant_inventory_versions.tenant_id
            and t.status = 'active'
        )
      );
  end if;
end;
$$;

create or replace function public.bump_tenant_inventory_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_tenant_id uuid;
begin
  affected_tenant_id := case when tg_op = 'DELETE' then old.tenant_id else new.tenant_id end;

  -- A tenant reassignment invalidates both catalogs. Ordinary updates, inserts,
  -- and deletes still touch only one version row.
  if tg_op = 'UPDATE' and old.tenant_id is distinct from new.tenant_id then
    insert into public.tenant_inventory_versions (tenant_id, version, updated_at)
    values (old.tenant_id, 1, now())
    on conflict (tenant_id) do update
      set version = public.tenant_inventory_versions.version + 1,
          updated_at = excluded.updated_at;
  end if;

  insert into public.tenant_inventory_versions (tenant_id, version, updated_at)
  values (affected_tenant_id, 1, now())
  on conflict (tenant_id) do update
    set version = public.tenant_inventory_versions.version + 1,
        updated_at = excluded.updated_at;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.bump_tenant_inventory_version() from public;

create or replace trigger vehicles_bump_inventory_version
after insert or update or delete on public.vehicles
for each row execute function public.bump_tenant_inventory_version();

create or replace trigger vehicle_images_bump_inventory_version
after insert or update or delete on public.vehicle_images
for each row execute function public.bump_tenant_inventory_version();

insert into public.tenant_inventory_versions (tenant_id)
select id from public.tenants
on conflict (tenant_id) do nothing;

create or replace function public.public_vehicle_inventory(p_tenant_id uuid)
returns table (
  id uuid,
  tenant_id uuid,
  external_id text,
  stock_type text,
  year integer,
  make text,
  model text,
  "trim" text,
  price numeric,
  mileage integer,
  body_style text,
  exterior_color text,
  interior_color text,
  drivetrain text,
  fuel_type text,
  image_src text,
  seller_city text,
  seller_state text,
  is_special boolean,
  special_image_src text,
  search_vector tsvector,
  status text,
  sold_at timestamptz,
  sold_price numeric,
  created_at timestamptz,
  primary_image_r2_key text,
  primary_image_alt text,
  catalog_version bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.id,
    v.tenant_id,
    v.external_id,
    v.stock_type,
    v.year,
    v.make,
    v.model,
    v.trim,
    v.price,
    v.mileage,
    v.body_style,
    v.exterior_color,
    v.interior_color,
    v.drivetrain,
    v.fuel_type,
    v.image_src,
    v.seller_city,
    v.seller_state,
    v.is_special,
    v.special_image_src,
    v.search_vector,
    v.status,
    v.sold_at,
    v.sold_price,
    v.created_at,
    primary_image.r2_key,
    primary_image.ai_description,
    coalesce(inventory_version.version, 1)
  from public.vehicles v
  join public.tenants t
    on t.id = v.tenant_id
   and t.status = 'active'
  left join public.tenant_inventory_versions inventory_version
    on inventory_version.tenant_id = v.tenant_id
  left join lateral (
    select vi.r2_key, vi.ai_description
    from public.vehicle_images vi
    where vi.tenant_id = v.tenant_id
      and vi.vehicle_id = v.id
    order by vi.is_primary desc, vi.sort_order asc, vi.created_at asc
    limit 1
  ) primary_image on true
  where v.tenant_id = p_tenant_id
    and v.status = 'live';
$$;

revoke all on function public.public_vehicle_inventory(uuid) from public;
grant execute on function public.public_vehicle_inventory(uuid) to anon, authenticated;

create or replace function public.vehicle_facets_v2(
  p_tenant_id uuid,
  p_make text default null,
  p_state text default null
)
returns table (
  makes text[],
  models text[],
  states text[],
  cities text[],
  year_min integer,
  year_max integer,
  price_min numeric,
  price_max numeric,
  mileage_min integer,
  mileage_max integer,
  catalog_version bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with live as (
    select v.make, v.model, v.seller_state, v.seller_city,
           v.year, v.price, v.mileage
    from public.vehicles v
    join public.tenants t on t.id = v.tenant_id
    where v.tenant_id = p_tenant_id
      and v.status = 'live'
      and t.status = 'active'
  )
  select
    (select coalesce(array_agg(distinct make order by make), '{}')
       from live where make is not null and make <> ''),
    (select coalesce(array_agg(distinct model order by model), '{}')
       from live where model is not null and model <> ''
         and (p_make is null or p_make = '' or make = p_make)),
    (select coalesce(array_agg(distinct seller_state order by seller_state), '{}')
       from live where seller_state is not null and seller_state <> ''),
    (select coalesce(array_agg(distinct seller_city order by seller_city), '{}')
       from live where seller_city is not null and seller_city <> ''
         and (p_state is null or p_state = '' or seller_state = p_state)),
    (select min(year) from live),
    (select max(year) from live),
    (select min(price) from live),
    (select max(price) from live),
    (select min(mileage) from live where mileage is not null),
    (select max(mileage) from live where mileage is not null),
    coalesce((
      select version from public.tenant_inventory_versions
      where tenant_id = p_tenant_id
    ), 1);
$$;

revoke all on function public.vehicle_facets_v2(uuid, text, text) from public;
grant execute on function public.vehicle_facets_v2(uuid, text, text) to anon, authenticated;
