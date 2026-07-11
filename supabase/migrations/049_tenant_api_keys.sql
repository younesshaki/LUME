-- 049_tenant_api_keys.sql
-- SCRUM-106. Per-tenant API keys: generate, scope, revoke. Only the SHA-256
-- of a key is stored — the raw key is shown once at creation and never again,
-- so a leaked table row cannot be replayed. Keys are managed by owner/admin in
-- the dashboard; verification happens server-side with the service-role client
-- because public API callers have no Supabase session.

create table if not exists public.tenant_api_keys (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  -- SHA-256 hex of the full raw key.
  key_hash text not null unique,
  -- First characters of the raw key (e.g. "lume_sk_ab12"), for display only.
  key_prefix text not null check (char_length(key_prefix) between 8 and 24),
  scopes text[] not null default '{}'::text[]
    check (scopes <@ array['leads:write', 'vehicles:read']::text[]),
  created_by uuid references auth.users(id) on delete set null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists tenant_api_keys_tenant_idx
  on public.tenant_api_keys (tenant_id, created_at desc);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.tenant_api_keys enable row level security;

-- Owner/admin manage their tenant's keys from the dashboard. Revocation is an
-- update (set revoked_at); rows are never deleted so the audit trail survives.
drop policy if exists "tenant_api_keys_select_admin" on public.tenant_api_keys;
create policy "tenant_api_keys_select_admin" on public.tenant_api_keys
  for select
  using (public.user_has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists "tenant_api_keys_insert_admin" on public.tenant_api_keys;
create policy "tenant_api_keys_insert_admin" on public.tenant_api_keys
  for insert
  with check (public.user_has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists "tenant_api_keys_update_admin" on public.tenant_api_keys;
create policy "tenant_api_keys_update_admin" on public.tenant_api_keys
  for update
  using (public.user_has_tenant_role(tenant_id, array['owner', 'admin']))
  with check (public.user_has_tenant_role(tenant_id, array['owner', 'admin']));
