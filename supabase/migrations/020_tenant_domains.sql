-- 020_tenant_domains.sql
-- Tenant-owned custom domains for public-site routing and verification.

create extension if not exists pgcrypto;

create table if not exists public.tenant_domains (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  domain text not null,
  verified boolean not null default false,
  verification_token text not null default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now(),
  constraint tenant_domains_domain_not_empty check (length(btrim(domain)) > 0),
  constraint tenant_domains_domain_lowercase check (domain = lower(domain)),
  constraint tenant_domains_verification_token_not_empty check (length(btrim(verification_token)) > 0)
);

create unique index if not exists tenant_domains_domain_idx
  on public.tenant_domains (domain);
create index if not exists tenant_domains_tenant_idx
  on public.tenant_domains (tenant_id);

alter table public.tenant_domains enable row level security;

drop policy if exists "tenant_domains_select_member" on public.tenant_domains;
create policy "tenant_domains_select_member" on public.tenant_domains
  for select
  using (tenant_id in (select public.tenant_ids_for_current_user()));

drop policy if exists "tenant_domains_write_editor" on public.tenant_domains;
create policy "tenant_domains_write_editor" on public.tenant_domains
  for all
  using (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']))
  with check (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']));
