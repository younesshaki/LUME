-- 068_publish_site_design.sql
-- Atomic website-design publish. Replaces the previous two-call publish path
-- (snapshot insert + tenants.theme update) so a partial failure can neither
-- publish without a rollback snapshot nor clobber a concurrent Navigation /
-- Branding save. Everything runs in one transaction under a row lock:
--   1. snapshot the current design into site_design_revisions,
--   2. preserve every non-editor key from the CURRENT document and overlay the
--      new design-owned keys (schemaVersion/template/shared/modes),
--   3. replace tenants.theme,
--   4. prune revision history to a bound.
-- SECURITY INVOKER + empty search_path; callable only by service_role (the
-- trusted server publish op), which bypasses RLS. Additive migration.

create or replace function public.publish_site_design(
  p_tenant_id uuid,
  p_design jsonb,
  p_actor uuid,
  p_max_revisions integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current jsonb;
  v_new jsonb;
  v_key text;
  v_version integer;
begin
  if jsonb_typeof(p_design) is distinct from 'object' then
    raise exception 'design document must be an object' using errcode = '22023';
  end if;

  -- Serialize concurrent publishes and read the current document under lock.
  select coalesce(theme, '{}'::jsonb) into v_current
    from public.tenants
    where id = p_tenant_id
    for update;
  if not found then
    raise exception 'tenant not found' using errcode = '23503';
  end if;

  v_key := coalesce(v_current -> 'template' ->> 'key', 'luxury');
  v_version := coalesce((v_current -> 'template' ->> 'version')::integer, 1);

  -- Snapshot the document being replaced (the rollback target).
  insert into public.site_design_revisions (
    tenant_id, design, template_key, template_version, published_by
  ) values (
    p_tenant_id, v_current, v_key, v_version, p_actor
  );

  -- Preserve every key the design editor does not own (header/branding/etc.)
  -- from the CURRENT document, then overlay the new design-owned keys. Legacy
  -- flat keys are dropped so publishing upgrades a legacy theme to v2.
  v_new := (
    v_current
      - 'schemaVersion' - 'template' - 'shared' - 'modes'
      - 'colors' - 'fonts' - 'dock' - 'dockVariant' - 'cinematic' - 'cinematicIntensity'
  ) || p_design;

  update public.tenants set theme = v_new where id = p_tenant_id;

  -- Bounded history: keep only the newest p_max_revisions rows.
  delete from public.site_design_revisions r
    where r.tenant_id = p_tenant_id
      and r.id not in (
        select id from public.site_design_revisions
        where tenant_id = p_tenant_id
        order by created_at desc, id desc
        limit greatest(p_max_revisions, 0)
      );

  return v_new;
end;
$$;

revoke all on function public.publish_site_design(uuid, jsonb, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.publish_site_design(uuid, jsonb, uuid, integer)
  to service_role;

comment on function public.publish_site_design(uuid, jsonb, uuid, integer) is
  'Atomically snapshots the current tenant website design, replaces it with the new design-owned keys (preserving non-editor keys), and prunes revision history to p_max_revisions.';
