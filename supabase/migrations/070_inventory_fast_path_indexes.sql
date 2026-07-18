-- Public inventory fast-path indexes.
--
-- These match the tenant-scoped live listing projection's common default sort
-- and primary-image lateral lookup. They are additive and leave all existing
-- tenant/RLS policies and function contracts unchanged.

create index if not exists vehicles_public_inventory_recommended_idx
  on public.vehicles (tenant_id, is_special desc, created_at desc, id)
  where status = 'live';

create index if not exists vehicle_images_public_primary_lookup_idx
  on public.vehicle_images (
    tenant_id,
    vehicle_id,
    is_primary desc,
    sort_order asc,
    created_at asc
  ) include (r2_key, ai_description);
