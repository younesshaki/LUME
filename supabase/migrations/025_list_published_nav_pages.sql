-- 025_list_published_nav_pages.sql
-- Public header navigation: the Vite site needs the ordered list of a
-- tenant's published, non-archived pages (slug + title only) without a
-- session. Anon has no direct access to public.pages by design, so this
-- mirrors the get_published_page SECURITY DEFINER pattern from 016/018 —
-- defensible because it enforces tenant scope + active status internally
-- and exposes nothing but nav metadata.

create or replace function public.list_published_nav_pages(p_tenant_id uuid)
returns table (
  slug text,
  title text,
  nav_order integer
)
language sql
stable
security definer
set search_path = public
as $$
  select p.slug, p.title, p.nav_order
  from public.pages p
  join public.tenants t on t.id = p.tenant_id
  where p.tenant_id = p_tenant_id
    and t.status = 'active'
    and p.archived_at is null
    and p.published_revision_id is not null
  order by p.nav_order asc, p.created_at asc;
$$;

grant execute on function public.list_published_nav_pages(uuid) to anon, authenticated;
