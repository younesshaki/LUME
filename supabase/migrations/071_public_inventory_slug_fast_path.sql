-- Collapse public tenant resolution and inventory/facet lookup into one
-- database RPC. The existing UUID-based RPCs remain unchanged for backwards
-- compatibility and for internal callers.

create or replace function public.public_vehicle_inventory_by_slug(p_slug text)
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
set search_path = ''
as $$
  select *
  from public.public_vehicle_inventory((
    select tenant.id
    from public.tenants tenant
    where tenant.slug = p_slug
      and tenant.status = 'active'
    limit 1
  ));
$$;

revoke all on function public.public_vehicle_inventory_by_slug(text)
  from public;
grant execute on function public.public_vehicle_inventory_by_slug(text)
  to anon, authenticated;

create or replace function public.vehicle_facets_by_slug(
  p_slug text,
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
set search_path = ''
as $$
  select facets.*
  from public.tenants tenant
  cross join lateral public.vehicle_facets_v2(tenant.id, p_make, p_state) facets
  where tenant.slug = p_slug
    and tenant.status = 'active';
$$;

revoke all on function public.vehicle_facets_by_slug(text, text, text)
  from public;
grant execute on function public.vehicle_facets_by_slug(text, text, text)
  to anon, authenticated;
