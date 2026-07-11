-- 043_vehicle_images.sql
-- SCRUM-108. Tenant-scoped metadata for direct-to-R2 vehicle image uploads.

create table if not exists public.vehicle_images (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  r2_key text not null,
  content_type text not null,
  byte_size bigint not null,
  width integer,
  height integer,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_images_r2_key_unique unique (tenant_id, r2_key),
  constraint vehicle_images_r2_key_bounded check (
    char_length(r2_key) between 1 and 512 and r2_key !~ '(^|/)\.\.(/|$)'
  ),
  constraint vehicle_images_content_type_allowed check (
    content_type in ('image/jpeg', 'image/png', 'image/webp')
  ),
  constraint vehicle_images_byte_size_bounded check (
    byte_size between 1 and 10485760
  ),
  constraint vehicle_images_dimensions_valid check (
    (width is null and height is null)
    or (
      width is not null and height is not null
      and width between 1 and 20000 and height between 1 and 20000
    )
  ),
  constraint vehicle_images_sort_order_nonnegative check (sort_order >= 0)
);

create index if not exists vehicle_images_vehicle_order_idx
  on public.vehicle_images (vehicle_id, sort_order, created_at);
create index if not exists vehicle_images_tenant_idx
  on public.vehicle_images (tenant_id, created_at desc);
create unique index if not exists vehicle_images_one_primary_idx
  on public.vehicle_images (vehicle_id)
  where is_primary;

alter table public.vehicle_images enable row level security;

drop policy if exists "vehicle_images_select_member" on public.vehicle_images;
create policy "vehicle_images_select_member" on public.vehicle_images
  for select to authenticated
  using (tenant_id in (select public.tenant_ids_for_current_user()));

drop policy if exists "vehicle_images_insert_editor" on public.vehicle_images;
create policy "vehicle_images_insert_editor" on public.vehicle_images
  for insert to authenticated
  with check (
    public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor'])
  );

drop policy if exists "vehicle_images_update_editor" on public.vehicle_images;
create policy "vehicle_images_update_editor" on public.vehicle_images
  for update to authenticated
  using (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']))
  with check (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']));

drop policy if exists "vehicle_images_delete_editor" on public.vehicle_images;
create policy "vehicle_images_delete_editor" on public.vehicle_images
  for delete to authenticated
  using (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']));

drop policy if exists "vehicle_images_select_public_live" on public.vehicle_images;
create policy "vehicle_images_select_public_live" on public.vehicle_images
  for select to anon
  using (
    exists (
      select 1
      from public.vehicles v
      join public.tenants t on t.id = v.tenant_id
      where v.id = vehicle_images.vehicle_id
        and v.tenant_id = vehicle_images.tenant_id
        and v.status = 'live'
        and t.status = 'active'
    )
  );

create or replace function public.prepare_vehicle_image_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  vehicle_tenant_id uuid;
  tenant_slug text;
  image_count integer;
  next_sort_order integer;
begin
  -- Serialize inserts per vehicle so the 20-image cap, append order, and first
  -- primary assignment remain correct under concurrent upload confirmations.
  select v.tenant_id, t.slug
  into vehicle_tenant_id, tenant_slug
  from public.vehicles v
  join public.tenants t on t.id = v.tenant_id
  where v.id = new.vehicle_id
  for update of v;

  if vehicle_tenant_id is null or vehicle_tenant_id <> new.tenant_id then
    raise exception 'Vehicle does not belong to tenant';
  end if;

  if left(new.r2_key, char_length(tenant_slug || '/vehicles/' || new.vehicle_id::text || '/'))
      <> tenant_slug || '/vehicles/' || new.vehicle_id::text || '/'
    or substring(
      new.r2_key
      from char_length(tenant_slug || '/vehicles/' || new.vehicle_id::text || '/') + 1
    ) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
  then
    raise exception 'Vehicle image key is outside the canonical tenant path';
  end if;

  if (new.content_type = 'image/jpeg' and right(new.r2_key, 4) <> '.jpg')
    or (new.content_type = 'image/png' and right(new.r2_key, 4) <> '.png')
    or (new.content_type = 'image/webp' and right(new.r2_key, 5) <> '.webp')
  then
    raise exception 'Vehicle image content type does not match its key';
  end if;

  select count(*)::integer
  into image_count
  from public.vehicle_images vi
  where vi.vehicle_id = new.vehicle_id;

  if image_count >= 20 then
    raise exception 'A vehicle may have at most 20 images';
  end if;

  select coalesce(max(vi.sort_order), -1) + 1
  into next_sort_order
  from public.vehicle_images vi
  where vi.vehicle_id = new.vehicle_id;

  new.sort_order := next_sort_order;
  new.is_primary := image_count = 0;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists vehicle_images_prepare_insert on public.vehicle_images;
create trigger vehicle_images_prepare_insert
  before insert on public.vehicle_images
  for each row execute function public.prepare_vehicle_image_insert();

create or replace function public.protect_vehicle_image_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.tenant_id <> old.tenant_id
    or new.vehicle_id <> old.vehicle_id
    or new.r2_key <> old.r2_key
    or new.content_type <> old.content_type
    or new.byte_size <> old.byte_size
    or new.width is distinct from old.width
    or new.height is distinct from old.height
    or new.created_at <> old.created_at
  then
    raise exception 'Vehicle image identity and uploaded metadata are immutable';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists vehicle_images_protect_identity on public.vehicle_images;
create trigger vehicle_images_protect_identity
  before update on public.vehicle_images
  for each row execute function public.protect_vehicle_image_identity();

revoke all on function public.prepare_vehicle_image_insert() from public;
revoke all on function public.protect_vehicle_image_identity() from public;

comment on table public.vehicle_images is
  'Metadata for up to 20 tenant-owned vehicle images stored in Cloudflare R2.';
