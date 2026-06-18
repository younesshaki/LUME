-- 018_pages_archived_at.sql
-- SCRUM-181: allow tenant editors to archive custom pages without deleting
-- their revision history. Reserved system pages should remain active.

alter table public.pages
  add column if not exists archived_at timestamptz;

create index if not exists pages_tenant_archived_idx
  on public.pages (tenant_id, archived_at);

create or replace function public.get_published_page(p_tenant_id uuid, p_slug text)
returns table (
  id uuid,
  slug text,
  title text,
  seo_meta jsonb,
  blocks jsonb,
  published_revision_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.slug, p.title, p.seo_meta, r.blocks, p.published_revision_id
  from public.pages p
  join public.tenants t on t.id = p.tenant_id
  join public.page_revisions r on r.id = p.published_revision_id
  where p.tenant_id = p_tenant_id
    and p.slug = p_slug
    and t.status = 'active'
    and p.archived_at is null
    and p.published_revision_id is not null;
$$;

grant execute on function public.get_published_page(uuid, text) to anon, authenticated;
