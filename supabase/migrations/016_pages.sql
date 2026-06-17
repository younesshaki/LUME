-- 016_pages.sql
-- Epic L (Site Builder) foundation — SCRUM-179/186/187/188.
-- Storage model per ADR-003 (Option B — Document + Revisions):
--   • `pages` holds metadata + two revision pointers (draft / published).
--   • `page_revisions` holds the ordered blocks document as jsonb.
--   • NO normalized page_blocks table — a page is a document.
-- Additive only. Nothing reads these tables in the live render path yet.

-- ─── Pages (metadata + pointers) ─────────────────────────────────────────────
create table if not exists public.pages (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  slug text not null,
  title text not null default '',
  nav_order integer not null default 0,
  is_reserved boolean not null default false,   -- reserved pages can't be deleted
  seo_meta jsonb not null default '{}'::jsonb,
  -- Pointers are the source of truth for which revision is live vs working draft.
  -- FKs added after page_revisions exists (circular reference).
  draft_revision_id uuid,
  published_revision_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

create index if not exists pages_tenant_idx on public.pages (tenant_id);
create index if not exists pages_tenant_nav_idx on public.pages (tenant_id, nav_order);

-- ─── Page revisions (the blocks document) ────────────────────────────────────
create table if not exists public.page_revisions (
  id uuid primary key default uuid_generate_v4(),
  page_id uuid not null references public.pages(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null default 'draft' check (kind in ('draft', 'published', 'autosave')),
  -- PageBlocksDocument: { version:int, blocks:[{ id, type, props }] }
  blocks jsonb not null default '{"version":1,"blocks":[]}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists page_revisions_page_idx
  on public.page_revisions (page_id, created_at desc);
create index if not exists page_revisions_tenant_idx
  on public.page_revisions (tenant_id);

-- ─── Circular pointer FKs (added now that both tables exist) ─────────────────
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pages_draft_revision_fk') then
    alter table public.pages
      add constraint pages_draft_revision_fk
      foreign key (draft_revision_id) references public.page_revisions(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pages_published_revision_fk') then
    alter table public.pages
      add constraint pages_published_revision_fk
      foreign key (published_revision_id) references public.page_revisions(id) on delete set null;
  end if;
end $$;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Members read/write their tenant's pages + revisions. Anon gets NO direct table
-- access — the public site reads published content only through get_published_page().
alter table public.pages enable row level security;
alter table public.page_revisions enable row level security;

drop policy if exists "pages_select_member" on public.pages;
create policy "pages_select_member" on public.pages
  for select
  using (tenant_id in (select public.tenant_ids_for_current_user()));

drop policy if exists "pages_write_editor" on public.pages;
create policy "pages_write_editor" on public.pages
  for all
  using (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']))
  with check (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']));

drop policy if exists "page_revisions_select_member" on public.page_revisions;
create policy "page_revisions_select_member" on public.page_revisions
  for select
  using (tenant_id in (select public.tenant_ids_for_current_user()));

drop policy if exists "page_revisions_write_editor" on public.page_revisions;
create policy "page_revisions_write_editor" on public.page_revisions
  for all
  using (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']))
  with check (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']));

-- ─── updated_at trigger ──────────────────────────────────────────────────────
drop trigger if exists pages_set_updated_at on public.pages;
create trigger pages_set_updated_at
  before update on public.pages
  for each row execute function public.set_updated_at();

-- ─── Public read: published page by slug (anon-friendly, drafts hidden) ──────
-- Mirrors tenant_by_slug / match_rag_chunks_for_tenant: SECURITY DEFINER with the
-- tenant + active-status + published-only filter enforced inside, so anon callers
-- can render the public site but can never reach drafts or other tenants.
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
    and p.published_revision_id is not null;
$$;

grant execute on function public.get_published_page(uuid, text) to anon, authenticated;
