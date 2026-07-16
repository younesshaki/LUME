-- Repair public read policies that joined public.tenants directly. The anon
-- role cannot read tenants, so those joins always evaluated to false. Use the
-- SECURITY DEFINER tenant_is_active(uuid) helper introduced by migration 017.
--
-- New permissive policies are additive. The historical policies remain in
-- place and can be removed during a future maintenance migration if desired.

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vehicle_images'
      and policyname = 'vehicle_images_select_public_live_v2'
  ) then
    create policy "vehicle_images_select_public_live_v2"
      on public.vehicle_images
      for select to anon
      using (
        public.tenant_is_active(vehicle_images.tenant_id)
        and exists (
          select 1
          from public.vehicles v
          where v.id = vehicle_images.vehicle_id
            and v.tenant_id = vehicle_images.tenant_id
            and v.status = 'live'
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tenant_inventory_versions'
      and policyname = 'tenant_inventory_versions_select_public_active_v2'
  ) then
    create policy "tenant_inventory_versions_select_public_active_v2"
      on public.tenant_inventory_versions
      for select to anon
      using (public.tenant_is_active(tenant_inventory_versions.tenant_id));
  end if;
end;
$$;
