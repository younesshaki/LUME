-- 042_public_vehicle_price_signal.sql
-- SCRUM-212. Tenant opt-in setter plus an aggregate-only public trust signal.

create or replace function public.set_public_vehicle_price_signal(
  p_tenant_id uuid,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  if p_enabled is null
    or auth.uid() is null
    or not public.user_has_tenant_role(p_tenant_id, array['owner', 'admin'])
  then
    return false;
  end if;

  update public.tenants t
  set theme = coalesce(t.theme, '{}'::jsonb) || jsonb_build_object(
    'vehiclePricing',
    case
      when jsonb_typeof(t.theme -> 'vehiclePricing') = 'object'
        then t.theme -> 'vehiclePricing'
      else '{}'::jsonb
    end || jsonb_build_object(
      'showPriceReductionSignal', p_enabled
    )
  )
  where t.id = p_tenant_id;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.set_public_vehicle_price_signal(uuid, boolean)
  from public, anon;
grant execute on function public.set_public_vehicle_price_signal(uuid, boolean)
  to authenticated;

create or replace function public.get_public_vehicle_price_signal(
  p_tenant_id uuid,
  p_vehicle_id uuid
)
returns table (enabled boolean, reductions integer)
language sql
stable
security definer
set search_path = public
as $$
  with eligible as (
    select 1
    from public.tenants t
    join public.vehicles v on v.tenant_id = t.id
    where t.id = p_tenant_id
      and t.status = 'active'
      and t.theme #> '{vehiclePricing,showPriceReductionSignal}' = 'true'::jsonb
      and v.id = p_vehicle_id
      and v.status = 'live'
  )
  select
    exists(select 1 from eligible) as enabled,
    case when exists(select 1 from eligible) then (
      select count(*)::integer
      from public.price_history ph
      where ph.tenant_id = p_tenant_id
        and ph.vehicle_id = p_vehicle_id
        and ph.old_price is not null
        and ph.new_price < ph.old_price
        and ph.changed_at >= now() - interval '30 days'
    ) else 0 end as reductions;
$$;

revoke all on function public.get_public_vehicle_price_signal(uuid, uuid)
  from public;
grant execute on function public.get_public_vehicle_price_signal(uuid, uuid)
  to anon, authenticated;

comment on function public.get_public_vehicle_price_signal(uuid, uuid) is
  'Aggregate-only 30-day reduction count for an opted-in active tenant/live vehicle.';
