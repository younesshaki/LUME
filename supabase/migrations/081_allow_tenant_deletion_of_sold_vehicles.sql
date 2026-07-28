-- 081_allow_tenant_deletion_of_sold_vehicles.sql
-- Makes tenant deletion possible again once a sale has been recorded.
--
-- protect_sold_vehicle_history() (migration 040) is a BEFORE DELETE trigger
-- that raises whenever old.sold_at is not null. It has no exception for the
-- tenant cascade, so ANY tenant that has ever recorded a single sale could
-- never be deleted — not by the offboarding path, not by the e2e teardown
-- that is documented as self-cleaning, and not in response to an erasure
-- request. Confirmed in production: test tenants carrying one sold vehicle
-- survived their own cleanup, and removing them required disabling the
-- trigger by hand.
--
-- The guard itself is correct and stays: deleting a sold vehicle from a live
-- tenant destroys sales history and must keep failing. What it must not do is
-- outlive the tenant that owns the record.
--
-- Fix: skip the guard when the owning tenant no longer exists. During
-- `delete from tenants`, the parent row is gone by the time the cascade
-- reaches vehicles, so the history being protected is being deleted anyway.
-- This is the same test migration 076 uses in
-- bump_tenant_inventory_version() for the identical cascade-ordering reason.

create or replace function public.protect_sold_vehicle_history()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.sold_at is not null
    and exists (select 1 from public.tenants where id = old.tenant_id)
  then
    raise exception 'Sold vehicle history cannot be deleted';
  end if;
  return old;
end;
$$;

revoke all on function public.protect_sold_vehicle_history() from public;

comment on function public.protect_sold_vehicle_history() is
  'Blocks deletion of sold vehicles while their tenant exists; yields to the tenant-deletion cascade so offboarding and erasure remain possible.';
