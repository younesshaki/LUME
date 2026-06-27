-- 023_tenant_invites.sql
-- Pending team invitations for tenant-scoped admin access.

create extension if not exists pgcrypto;

create table if not exists public.tenant_invites (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  role text not null default 'viewer'
    check (role in ('owner', 'admin', 'editor', 'viewer')),
  token text not null default encode(gen_random_bytes(24), 'hex'),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_invites_email_not_empty check (length(btrim(email)) > 0),
  constraint tenant_invites_email_lowercase check (email = lower(email)),
  constraint tenant_invites_token_not_empty check (length(btrim(token)) > 0)
);

create index if not exists tenant_invites_tenant_idx
  on public.tenant_invites (tenant_id);
create index if not exists tenant_invites_tenant_status_idx
  on public.tenant_invites (tenant_id, status);
create unique index if not exists tenant_invites_pending_email_idx
  on public.tenant_invites (tenant_id, email)
  where status = 'pending';

alter table public.tenant_invites enable row level security;

drop policy if exists "tenant_invites_select_member" on public.tenant_invites;
create policy "tenant_invites_select_member" on public.tenant_invites
  for select
  using (tenant_id in (select public.tenant_ids_for_current_user()));

drop policy if exists "tenant_invites_write_editor" on public.tenant_invites;
create policy "tenant_invites_write_editor" on public.tenant_invites
  for all
  using (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']))
  with check (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']));

drop trigger if exists tenant_invites_set_updated_at on public.tenant_invites;
create trigger tenant_invites_set_updated_at
  before update on public.tenant_invites
  for each row execute function public.set_updated_at();
