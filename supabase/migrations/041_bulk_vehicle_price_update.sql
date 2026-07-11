-- 041_bulk_vehicle_price_update.sql
-- SCRUM-209. Atomic, service-only bulk price rules. Existing per-row price
-- history triggers still record every changed vehicle.

create or replace function public.bulk_update_vehicle_prices(
  p_tenant_id uuid,
  p_vehicle_ids uuid[],
  p_rule text,
  p_value numeric
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  input_count integer;
  requested_count integer;
  found_count integer;
  updated_count integer;
begin
  select count(*), count(distinct selected.id)
  into input_count, requested_count
  from unnest(p_vehicle_ids) as selected(id);

  if requested_count < 1 or requested_count > 200 or input_count <> requested_count then
    raise exception 'Select between 1 and 200 unique vehicles';
  end if;
  if p_rule is null
    or p_rule not in ('percent', 'fixed', 'set')
    or p_value is null
    or p_value = 'NaN'::numeric
  then
    raise exception 'Invalid bulk price rule';
  end if;
  if p_rule in ('percent', 'fixed') and p_value = 0 then
    raise exception 'Bulk price change must be non-zero';
  end if;
  if p_rule = 'percent' and (p_value <= -100 or p_value > 1000) then
    raise exception 'Percentage must be greater than -100 and at most 1000';
  end if;
  if p_rule = 'fixed' and abs(p_value) > 100000000 then
    raise exception 'Fixed change is outside the allowed range';
  end if;
  if p_rule = 'set' and (p_value <= 0 or p_value > 2147483647) then
    raise exception 'Set price is outside the allowed range';
  end if;

  select count(*) into found_count
  from public.vehicles v
  where v.tenant_id = p_tenant_id
    and v.id = any(p_vehicle_ids);
  if found_count <> requested_count then
    raise exception 'One or more selected vehicles were not found';
  end if;
  if exists (
    select 1 from public.vehicles v
    where v.tenant_id = p_tenant_id
      and v.id = any(p_vehicle_ids)
      and v.sold_at is not null
  ) then
    raise exception 'Sold vehicle prices are frozen';
  end if;
  if exists (
    select 1 from public.vehicles v
    where v.tenant_id = p_tenant_id
      and v.id = any(p_vehicle_ids)
      and (
        case p_rule
          when 'percent' then round(v.price * (1 + p_value / 100))
          when 'fixed' then round(v.price + p_value)
          else round(p_value)
        end
      ) not between 1 and 2147483647
  ) then
    raise exception 'Bulk rule would create an invalid vehicle price';
  end if;

  update public.vehicles v
  set price = (
    case p_rule
      when 'percent' then round(v.price * (1 + p_value / 100))
      when 'fixed' then round(v.price + p_value)
      else round(p_value)
    end
  )::integer
  where v.tenant_id = p_tenant_id
    and v.id = any(p_vehicle_ids);
  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.bulk_update_vehicle_prices(uuid, uuid[], text, numeric)
  from public, anon, authenticated;
grant execute on function public.bulk_update_vehicle_prices(uuid, uuid[], text, numeric)
  to service_role;

comment on function public.bulk_update_vehicle_prices(uuid, uuid[], text, numeric) is
  'Atomic, bounded bulk price mutation for an already-authorized tenant action.';
