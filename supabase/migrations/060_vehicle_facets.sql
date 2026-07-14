-- 060_vehicle_facets.sql
-- Public inventory performance: compute filter-dropdown values (makes, models,
-- states, cities) in SQL instead of downloading the whole catalog client-side.
--
-- The facet values are already publicly visible in the listing, so exposing
-- the distinct sets to anon is not a new disclosure. The function still gates
-- on the same visibility rule as the anon RLS policy: only live vehicles of an
-- active tenant are considered, and results are scoped to the passed tenant.

create or replace function public.vehicle_facets(
  p_tenant_id uuid,
  p_make text default null,
  p_state text default null
)
returns table (
  makes text[],
  models text[],
  states text[],
  cities text[]
)
language sql
stable
security definer
set search_path = public
as $$
  with live as (
    select v.make, v.model, v.seller_state, v.seller_city
    from public.vehicles v
    join public.tenants t on t.id = v.tenant_id
    where v.tenant_id = p_tenant_id
      and v.status = 'live'
      and t.status = 'active'
  )
  select
    (select coalesce(array_agg(distinct make order by make), '{}')
       from live where make is not null and make <> '') as makes,
    (select coalesce(array_agg(distinct model order by model), '{}')
       from live
       where model is not null and model <> ''
         and (p_make is null or p_make = '' or make = p_make)) as models,
    (select coalesce(array_agg(distinct seller_state order by seller_state), '{}')
       from live where seller_state is not null and seller_state <> '') as states,
    (select coalesce(array_agg(distinct seller_city order by seller_city), '{}')
       from live
       where seller_city is not null and seller_city <> ''
         and (p_state is null or p_state = '' or seller_state = p_state)) as cities;
$$;

grant execute on function public.vehicle_facets(uuid, text, text) to anon, authenticated;
