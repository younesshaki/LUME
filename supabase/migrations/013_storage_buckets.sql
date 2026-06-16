-- 013_storage_buckets.sql
-- Epic J (Tenant Storage & Asset Pipeline) foundation — SCRUM-157.
-- Four tenant-scoped storage buckets. Every object MUST be stored under a
-- top-level folder equal to the owning tenant's id, i.e. paths look like
-- `{tenant_id}/logo.png`. RLS on storage.objects enforces that a member can
-- only read/write within their own tenant's folder.
--
-- Public vs private:
--   • tenant-logos, tenant-media  → public bucket (CDN-style anon read)
--   • tenant-csvs, tenant-3d-models → private (access via signed URLs only)
--
-- A user may belong to multiple tenants, so the policies use `in (...)`
-- against tenant_members rather than a scalar subquery.

-- ─── Buckets ─────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values
  ('tenant-logos',     'tenant-logos',     true),
  ('tenant-media',     'tenant-media',     true),
  ('tenant-csvs',      'tenant-csvs',      false),
  ('tenant-3d-models', 'tenant-3d-models', false)
on conflict (id) do nothing;

-- ─── Helper: folder (first path segment) must be one of the user's tenants ───
-- (storage.foldername(name))[1] is the top-level folder of the object key.

-- ─── Write policies (authenticated, editor+) for ALL four buckets ────────────
-- Members with editor+ role can manage objects within their tenant folder.
drop policy if exists "tenant_objects_insert" on storage.objects;
create policy "tenant_objects_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('tenant-logos', 'tenant-media', 'tenant-csvs', 'tenant-3d-models')
    and (storage.foldername(name))[1] in (
      select tm.tenant_id::text
      from public.tenant_members tm
      where tm.user_id = auth.uid()
        and tm.role in ('owner', 'admin', 'editor')
    )
  );

drop policy if exists "tenant_objects_update" on storage.objects;
create policy "tenant_objects_update" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('tenant-logos', 'tenant-media', 'tenant-csvs', 'tenant-3d-models')
    and (storage.foldername(name))[1] in (
      select tm.tenant_id::text
      from public.tenant_members tm
      where tm.user_id = auth.uid()
        and tm.role in ('owner', 'admin', 'editor')
    )
  );

drop policy if exists "tenant_objects_delete" on storage.objects;
create policy "tenant_objects_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('tenant-logos', 'tenant-media', 'tenant-csvs', 'tenant-3d-models')
    and (storage.foldername(name))[1] in (
      select tm.tenant_id::text
      from public.tenant_members tm
      where tm.user_id = auth.uid()
        and tm.role in ('owner', 'admin', 'editor')
    )
  );

-- ─── Read policies ───────────────────────────────────────────────────────────
-- Members can read anything in their tenant folder across all buckets.
drop policy if exists "tenant_objects_select_member" on storage.objects;
create policy "tenant_objects_select_member" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('tenant-logos', 'tenant-media', 'tenant-csvs', 'tenant-3d-models')
    and (storage.foldername(name))[1] in (
      select tm.tenant_id::text
      from public.tenant_members tm
      where tm.user_id = auth.uid()
    )
  );

-- Anonymous (public site) read for the public buckets only. Private buckets
-- (csvs, 3d-models) are reachable only via signed URLs created server-side.
drop policy if exists "tenant_objects_select_public" on storage.objects;
create policy "tenant_objects_select_public" on storage.objects
  for select to anon
  using (bucket_id in ('tenant-logos', 'tenant-media'));
