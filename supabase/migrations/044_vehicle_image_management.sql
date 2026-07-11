-- 044_vehicle_image_management.sql
-- SCRUM-111. Atomic, tenant-scoped vehicle image management operations.

-- Inserts from 043 already allocate distinct append positions. Enforce that
-- invariant for subsequent management operations as well.
create unique index if not exists vehicle_images_vehicle_sort_order_unique_idx
  on public.vehicle_images (vehicle_id, sort_order);

-- Update/delete must pass through the atomic functions below. Keeping the
-- permissive policies from 043 would let browser clients bypass primary
-- promotion and R2 deletion coordination. Member SELECT and confirmed INSERT
-- remain governed by their existing tenant policies.
drop policy if exists "vehicle_images_update_editor" on public.vehicle_images;
drop policy if exists "vehicle_images_delete_editor" on public.vehicle_images;

create or replace function public.reorder_vehicle_images(
  p_tenant_id uuid,
  p_vehicle_id uuid,
  p_image_ids uuid[]
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  supplied_count integer;
  distinct_count integer;
  existing_count integer;
  matching_count integer;
  maximum_sort_order integer;
  temporary_offset integer;
begin
  if auth.uid() is null
    or not public.user_has_tenant_role(
      p_tenant_id,
      array['owner', 'admin', 'editor']
    )
  then
    raise exception 'Not authorized to manage vehicle images';
  end if;

  -- All management RPCs serialize on the vehicle row. This also proves the
  -- vehicle belongs to the supplied tenant before the definer mutates data.
  perform 1
  from public.vehicles v
  where v.id = p_vehicle_id
    and v.tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'Vehicle does not belong to tenant';
  end if;

  if p_image_ids is null then
    raise exception 'Ordered image list is required';
  end if;

  if cardinality(p_image_ids) > 20 then
    raise exception 'A vehicle may have at most 20 images';
  end if;

  select count(*)::integer, count(distinct requested.image_id)::integer
  into supplied_count, distinct_count
  from unnest(p_image_ids) as requested(image_id);

  if supplied_count <> distinct_count then
    raise exception 'Ordered image list contains duplicate IDs';
  end if;

  select count(*)::integer, coalesce(max(vi.sort_order), -1)
  into existing_count, maximum_sort_order
  from public.vehicle_images vi
  where vi.tenant_id = p_tenant_id
    and vi.vehicle_id = p_vehicle_id;

  select count(*)::integer
  into matching_count
  from unnest(p_image_ids) as requested(image_id)
  join public.vehicle_images vi on vi.id = requested.image_id
  where vi.tenant_id = p_tenant_id
    and vi.vehicle_id = p_vehicle_id;

  if supplied_count <> existing_count or matching_count <> existing_count then
    raise exception 'Ordered image list must contain every vehicle image exactly once';
  end if;

  if existing_count = 0 then
    return true;
  end if;

  -- Move every row above the current range before assigning 0..n-1. The
  -- intermediate range avoids immediate unique-index collisions when two
  -- images swap positions.
  if maximum_sort_order > 1073741800 then
    raise exception 'Vehicle image sort order is outside the supported range';
  end if;

  temporary_offset := maximum_sort_order + existing_count + 1;

  update public.vehicle_images vi
  set sort_order = vi.sort_order + temporary_offset
  where vi.tenant_id = p_tenant_id
    and vi.vehicle_id = p_vehicle_id;

  update public.vehicle_images vi
  set sort_order = requested.ordinality::integer - 1
  from unnest(p_image_ids) with ordinality as requested(image_id, ordinality)
  where vi.id = requested.image_id
    and vi.tenant_id = p_tenant_id
    and vi.vehicle_id = p_vehicle_id;

  return true;
end;
$$;

create or replace function public.set_primary_vehicle_image(
  p_tenant_id uuid,
  p_vehicle_id uuid,
  p_image_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
    or not public.user_has_tenant_role(
      p_tenant_id,
      array['owner', 'admin', 'editor']
    )
  then
    raise exception 'Not authorized to manage vehicle images';
  end if;

  perform 1
  from public.vehicles v
  where v.id = p_vehicle_id
    and v.tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'Vehicle does not belong to tenant';
  end if;

  perform 1
  from public.vehicle_images vi
  where vi.id = p_image_id
    and vi.tenant_id = p_tenant_id
    and vi.vehicle_id = p_vehicle_id;

  if not found then
    raise exception 'Image does not belong to vehicle';
  end if;

  -- Clear first so the partial one-primary unique index never sees two true
  -- values while changing the primary image.
  update public.vehicle_images vi
  set is_primary = false
  where vi.tenant_id = p_tenant_id
    and vi.vehicle_id = p_vehicle_id
    and vi.is_primary;

  update public.vehicle_images vi
  set is_primary = true
  where vi.id = p_image_id
    and vi.tenant_id = p_tenant_id
    and vi.vehicle_id = p_vehicle_id;

  return true;
end;
$$;

create or replace function public.delete_vehicle_image(
  p_tenant_id uuid,
  p_vehicle_id uuid,
  p_image_id uuid
)
returns table (
  r2_key text,
  promoted_image_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_r2_key text;
  deleted_was_primary boolean;
  deleted_sort_order integer;
  next_primary_id uuid;
  remaining_count integer;
  remaining_maximum_sort_order integer;
  compaction_offset integer;
begin
  if auth.uid() is null
    or not public.user_has_tenant_role(
      p_tenant_id,
      array['owner', 'admin', 'editor']
    )
  then
    raise exception 'Not authorized to manage vehicle images';
  end if;

  perform 1
  from public.vehicles v
  where v.id = p_vehicle_id
    and v.tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'Vehicle does not belong to tenant';
  end if;

  delete from public.vehicle_images vi
  where vi.id = p_image_id
    and vi.tenant_id = p_tenant_id
    and vi.vehicle_id = p_vehicle_id
  returning vi.r2_key, vi.is_primary, vi.sort_order
  into deleted_r2_key, deleted_was_primary, deleted_sort_order;

  if not found then
    raise exception 'Image does not belong to vehicle';
  end if;

  if deleted_was_primary then
    -- Prefer the next image after the removed position, wrapping to the first
    -- remaining image when the removed image was last.
    select vi.id
    into next_primary_id
    from public.vehicle_images vi
    where vi.tenant_id = p_tenant_id
      and vi.vehicle_id = p_vehicle_id
    order by
      case when vi.sort_order > deleted_sort_order then 0 else 1 end,
      vi.sort_order,
      vi.created_at,
      vi.id
    limit 1;
  end if;

  -- Preserve the contiguous order invariant after removing a row. As with a
  -- reorder, use a temporary range so the immediate unique index cannot see a
  -- transient collision while multiple later positions move down.
  select count(*)::integer, coalesce(max(vi.sort_order), -1)
  into remaining_count, remaining_maximum_sort_order
  from public.vehicle_images vi
  where vi.tenant_id = p_tenant_id
    and vi.vehicle_id = p_vehicle_id;

  if remaining_count > 0 then
    if remaining_maximum_sort_order > 1073741800 then
      raise exception 'Vehicle image sort order is outside the supported range';
    end if;

    compaction_offset := remaining_maximum_sort_order + remaining_count + 1;

    update public.vehicle_images vi
    set sort_order = vi.sort_order + compaction_offset
    where vi.tenant_id = p_tenant_id
      and vi.vehicle_id = p_vehicle_id;

    with compacted as (
      select
        vi.id,
        row_number() over (
          order by vi.sort_order, vi.created_at, vi.id
        )::integer - 1 as next_sort_order
      from public.vehicle_images vi
      where vi.tenant_id = p_tenant_id
        and vi.vehicle_id = p_vehicle_id
    )
    update public.vehicle_images vi
    set sort_order = compacted.next_sort_order
    from compacted
    where vi.id = compacted.id
      and vi.tenant_id = p_tenant_id
      and vi.vehicle_id = p_vehicle_id;
  end if;

  if next_primary_id is not null then
    update public.vehicle_images vi
    set is_primary = true
    where vi.id = next_primary_id
      and vi.tenant_id = p_tenant_id
      and vi.vehicle_id = p_vehicle_id;
  end if;

  r2_key := deleted_r2_key;
  promoted_image_id := next_primary_id;
  return next;
end;
$$;

revoke all on function public.reorder_vehicle_images(uuid, uuid, uuid[]) from public;
revoke all on function public.reorder_vehicle_images(uuid, uuid, uuid[]) from anon;
grant execute on function public.reorder_vehicle_images(uuid, uuid, uuid[]) to authenticated;

revoke all on function public.set_primary_vehicle_image(uuid, uuid, uuid) from public;
revoke all on function public.set_primary_vehicle_image(uuid, uuid, uuid) from anon;
grant execute on function public.set_primary_vehicle_image(uuid, uuid, uuid) to authenticated;

revoke all on function public.delete_vehicle_image(uuid, uuid, uuid) from public;
revoke all on function public.delete_vehicle_image(uuid, uuid, uuid) from anon;
grant execute on function public.delete_vehicle_image(uuid, uuid, uuid) to authenticated;

comment on function public.reorder_vehicle_images(uuid, uuid, uuid[]) is
  'Atomically validates and applies an exact full ordering of a vehicle image set.';
comment on function public.set_primary_vehicle_image(uuid, uuid, uuid) is
  'Atomically selects one tenant-owned image as the vehicle primary.';
comment on function public.delete_vehicle_image(uuid, uuid, uuid) is
  'Deletes one metadata row, compacts order, promotes a successor, and returns its R2 key.';
