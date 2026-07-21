-- 075_vehicle_feed_sync_images.sql
-- Preserve supplier-hosted galleries independently from tenant-owned R2 media.
-- Feed syncs update these values in place; they never replace vehicle records.

alter table public.vehicles
  add column if not exists feed_vin text,
  add column if not exists feed_image_urls text[] not null default '{}'::text[],
  add column if not exists feed_updated_at timestamptz;

alter table public.vehicles
  drop constraint if exists vehicles_feed_vin_bounded,
  drop constraint if exists vehicles_feed_image_urls_bounded;

alter table public.vehicles
  add constraint vehicles_feed_vin_bounded
    check (feed_vin is null or char_length(feed_vin) between 1 and 64),
  add constraint vehicles_feed_image_urls_bounded
    check (cardinality(feed_image_urls) <= 50);

create index if not exists vehicles_tenant_feed_vin_idx
  on public.vehicles (tenant_id, lower(feed_vin))
  where feed_vin is not null;

create index if not exists vehicles_tenant_external_id_idx
  on public.vehicles (tenant_id, lower(external_id))
  where external_id is not null;

alter table public.vehicle_images
  add column if not exists source_url text;

create unique index if not exists vehicle_images_feed_source_unique
  on public.vehicle_images (vehicle_id, source_url)
  where source_url is not null;

alter table public.csv_imports
  drop constraint if exists csv_imports_mode_check;

alter table public.csv_imports
  add constraint csv_imports_mode_check
  check (mode in ('add', 'replace', 'sync'));

comment on column public.vehicles.feed_vin is
  'Stable VIN received from an inventory feed. Used for tenant-scoped feed synchronization.';

comment on column public.vehicles.feed_image_urls is
  'Ordered supplier-hosted inventory-feed images. They are display fallbacks, not tenant-owned R2 vehicle_images.';

comment on column public.vehicles.feed_updated_at is
  'When the listing was last successfully synchronized from an inventory feed.';

comment on column public.vehicle_images.source_url is
  'Original supplier URL when an editor explicitly copies a feed image into tenant R2 storage.';
