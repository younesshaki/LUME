-- 076_fix_tenant_deletion_inventory_version_trigger.sql
-- Fixes a bug that made tenant deletion fail for any tenant with vehicles.
--
-- bump_tenant_inventory_version() runs AFTER DELETE on vehicles and tries to
-- upsert a row into tenant_inventory_versions for the vehicle's tenant. When
-- a tenant itself is deleted, Postgres cascades that delete to its vehicles
-- (which fires this trigger per row) and to its own
-- tenant_inventory_versions row, in no guaranteed order. If the tenant row
-- is already gone by the time the trigger's insert runs, it violates
-- tenant_inventory_versions.tenant_id's (immediate, non-deferrable) foreign
-- key to tenants(id), and the whole DELETE FROM tenants transaction fails.
--
-- Fix: on a DELETE-triggered call, skip the version bump entirely if the
-- tenant no longer exists — there is nothing meaningful to bump for a
-- tenant that is being removed, and the public catalog it would invalidate
-- is being deleted anyway.

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

  -- The tenant itself may already be gone (or going, in the same cascade) —
  -- nothing to bump for a tenant being deleted.
  if tg_op = 'DELETE'
    and not exists (select 1 from public.tenants where id = affected_tenant_id)
  then
    return old;
  end if;

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
