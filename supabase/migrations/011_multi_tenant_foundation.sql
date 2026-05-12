-- 011_multi_tenant_foundation.sql
-- Multi-tenant SaaS foundation: tenants, members, vehicles, RAG documents/chunks.
-- All tenant-scoped tables use Row Level Security so a tenant can only ever see
-- its own rows. Service-role keys bypass RLS for server-side admin work.

-- ─── Extensions ────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists vector;

-- ─── Helper: current_user_id() ─────────────────────────────────────────────
-- auth.uid() returns the JWT subject (a Supabase auth user id).
-- We wrap it so every policy reads the same way.

-- ─── Tenants ───────────────────────────────────────────────────────────────
create table if not exists public.tenants (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique,
  name text not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'trial')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tenants_slug_idx on public.tenants (slug);

-- ─── Tenant members ────────────────────────────────────────────────────────
-- Links Supabase auth users to tenants, with a role.
create table if not exists public.tenant_members (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'admin', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create index if not exists tenant_members_user_idx on public.tenant_members (user_id);

-- ─── Helper: tenant_ids_for_current_user() ─────────────────────────────────
-- Returns tenant ids the calling user belongs to. Used in every RLS policy.
-- SECURITY DEFINER so the function can read tenant_members without recursing
-- into RLS on that table.
create or replace function public.tenant_ids_for_current_user()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.tenant_members where user_id = auth.uid();
$$;

-- ─── Tenant role check ─────────────────────────────────────────────────────
create or replace function public.user_has_tenant_role(
  p_tenant_id uuid,
  p_roles text[]
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_members
    where tenant_id = p_tenant_id
      and user_id = auth.uid()
      and role = any (p_roles)
  );
$$;

-- ─── Vehicles (tenant-scoped) ──────────────────────────────────────────────
create table if not exists public.vehicles (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  external_id text,
  stock_type text,
  year integer not null,
  make text not null,
  model text not null,
  trim text default '',
  price integer not null default 0,
  mileage integer,
  body_style text default '',
  exterior_color text default '',
  interior_color text default '',
  drivetrain text default '',
  fuel_type text default '',
  image_src text default '',
  seller_city text default '',
  seller_state text default '',
  is_special boolean not null default false,
  special_image_src text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vehicles_tenant_idx on public.vehicles (tenant_id);
create index if not exists vehicles_tenant_make_idx on public.vehicles (tenant_id, make);
create index if not exists vehicles_tenant_body_style_idx on public.vehicles (tenant_id, body_style);
create index if not exists vehicles_tenant_price_idx on public.vehicles (tenant_id, price);
create index if not exists vehicles_tenant_year_idx on public.vehicles (tenant_id, year);
create unique index if not exists vehicles_tenant_external_idx
  on public.vehicles (tenant_id, external_id)
  where external_id is not null;

-- ─── RAG documents + chunks (tenant-scoped, pgvector) ──────────────────────
-- Embedding dimension matches `nomic-embed-text` (768). When we add support
-- for tenant-pickable embedding models, either standardize on a single dim
-- per deployment or add per-dim chunk tables.
create table if not exists public.rag_documents (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  category text not null default 'general',
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rag_documents_tenant_idx on public.rag_documents (tenant_id);

create table if not exists public.rag_chunks (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  document_id uuid not null references public.rag_documents(id) on delete cascade,
  external_id text,
  text text not null,
  category text not null default 'general',
  embedding vector(768),
  created_at timestamptz not null default now()
);

create index if not exists rag_chunks_tenant_idx on public.rag_chunks (tenant_id);
create index if not exists rag_chunks_document_idx on public.rag_chunks (document_id);

-- HNSW index for fast cosine similarity, scoped per tenant in queries.
create index if not exists rag_chunks_embedding_idx
  on public.rag_chunks
  using hnsw (embedding vector_cosine_ops);

-- ─── RLS ───────────────────────────────────────────────────────────────────
alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.vehicles enable row level security;
alter table public.rag_documents enable row level security;
alter table public.rag_chunks enable row level security;

-- Tenants: members can read their own tenant; only owners/admins can update.
drop policy if exists "tenants_select_member" on public.tenants;
create policy "tenants_select_member" on public.tenants
  for select
  using (id in (select public.tenant_ids_for_current_user()));

drop policy if exists "tenants_update_admin" on public.tenants;
create policy "tenants_update_admin" on public.tenants
  for update
  using (public.user_has_tenant_role(id, array['owner', 'admin']))
  with check (public.user_has_tenant_role(id, array['owner', 'admin']));

-- Tenant members: members can read their own membership rows; owners manage.
drop policy if exists "tenant_members_select_self" on public.tenant_members;
create policy "tenant_members_select_self" on public.tenant_members
  for select
  using (user_id = auth.uid() or public.user_has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists "tenant_members_write_owner" on public.tenant_members;
create policy "tenant_members_write_owner" on public.tenant_members
  for all
  using (public.user_has_tenant_role(tenant_id, array['owner']))
  with check (public.user_has_tenant_role(tenant_id, array['owner']));

-- Vehicles: read for any member; write for editor+.
drop policy if exists "vehicles_select_member" on public.vehicles;
create policy "vehicles_select_member" on public.vehicles
  for select
  using (tenant_id in (select public.tenant_ids_for_current_user()));

drop policy if exists "vehicles_write_editor" on public.vehicles;
create policy "vehicles_write_editor" on public.vehicles
  for all
  using (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']))
  with check (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']));

-- RAG documents/chunks: read for any member; write for editor+.
drop policy if exists "rag_documents_select_member" on public.rag_documents;
create policy "rag_documents_select_member" on public.rag_documents
  for select
  using (tenant_id in (select public.tenant_ids_for_current_user()));

drop policy if exists "rag_documents_write_editor" on public.rag_documents;
create policy "rag_documents_write_editor" on public.rag_documents
  for all
  using (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']))
  with check (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']));

drop policy if exists "rag_chunks_select_member" on public.rag_chunks;
create policy "rag_chunks_select_member" on public.rag_chunks
  for select
  using (tenant_id in (select public.tenant_ids_for_current_user()));

drop policy if exists "rag_chunks_write_editor" on public.rag_chunks;
create policy "rag_chunks_write_editor" on public.rag_chunks
  for all
  using (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']))
  with check (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']));

-- ─── Public read on the default tenant ─────────────────────────────────────
-- The Vite (public) site uses the anon key and needs to read its tenant's
-- vehicles + RAG to render the site. We allow public read scoped to the
-- tenant resolved from the request — server code passes the tenant_id and
-- this policy lets unauthenticated clients see only that tenant's data when
-- it's marked active.
--
-- For now: public read of vehicles/rag for any tenant whose status='active'.
-- (`anon` role uses these policies; `authenticated` users get the member
-- policies above which take precedence.)
drop policy if exists "vehicles_select_public_active" on public.vehicles;
create policy "vehicles_select_public_active" on public.vehicles
  for select
  to anon
  using (
    exists (
      select 1 from public.tenants t
      where t.id = vehicles.tenant_id and t.status = 'active'
    )
  );

drop policy if exists "rag_chunks_select_public_active" on public.rag_chunks;
create policy "rag_chunks_select_public_active" on public.rag_chunks
  for select
  to anon
  using (
    exists (
      select 1 from public.tenants t
      where t.id = rag_chunks.tenant_id and t.status = 'active'
    )
  );

-- ─── Tenant-scoped vector search ───────────────────────────────────────────
-- Returns the top-k chunks most similar to the query embedding, scoped to a
-- single tenant. SECURITY DEFINER so anon callers (public site) can use it,
-- but the tenant_id filter is enforced inside the function — callers cannot
-- read other tenants' chunks.
create or replace function public.match_rag_chunks_for_tenant(
  p_tenant_id uuid,
  p_query_embedding vector(768),
  p_match_count integer default 7
)
returns table (
  id uuid,
  document_id uuid,
  text text,
  category text,
  similarity float
)
language sql
stable
security definer
set search_path = public
as $$
  select
    rc.id,
    rc.document_id,
    rc.text,
    rc.category,
    1 - (rc.embedding <=> p_query_embedding) as similarity
  from public.rag_chunks rc
  join public.tenants t on t.id = rc.tenant_id
  where rc.tenant_id = p_tenant_id
    and t.status = 'active'
    and rc.embedding is not null
  order by rc.embedding <=> p_query_embedding
  limit p_match_count;
$$;

grant execute on function public.match_rag_chunks_for_tenant(uuid, vector, integer)
  to anon, authenticated, service_role;

-- ─── Tenant lookup by slug (anon-friendly) ─────────────────────────────────
-- The public site needs to resolve {tenant-slug} → tenant_id without auth.
-- We expose a SECURITY DEFINER function that returns only id+slug+name+status,
-- so we don't have to relax RLS on the tenants table itself.
create or replace function public.tenant_by_slug(p_slug text)
returns table (id uuid, slug text, name text, status text)
language sql
stable
security definer
set search_path = public
as $$
  select id, slug, name, status from public.tenants where slug = p_slug;
$$;

grant execute on function public.tenant_by_slug(text) to anon, authenticated;

-- ─── Updated_at triggers ───────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tenants_set_updated_at on public.tenants;
create trigger tenants_set_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

drop trigger if exists vehicles_set_updated_at on public.vehicles;
create trigger vehicles_set_updated_at
  before update on public.vehicles
  for each row execute function public.set_updated_at();

drop trigger if exists rag_documents_set_updated_at on public.rag_documents;
create trigger rag_documents_set_updated_at
  before update on public.rag_documents
  for each row execute function public.set_updated_at();
