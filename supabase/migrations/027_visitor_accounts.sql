-- 027_visitor_accounts.sql
-- Epic G (Visitor Accounts) — SCRUM-128 + SCRUM-178.
-- Public-site visitors: their own login identity, separate from tenant_members
-- (which are the paying operators). Auth is handled server-side with the
-- service-role key: password hashing + opaque session tokens live in the admin
-- app, so these tables have NO client-side access at all — RLS is enabled with
-- no policies, meaning only the service role (which bypasses RLS) can touch
-- them. That is deliberate: password_hash must never be reachable via the API.

create table if not exists public.visitors (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,                 -- stored lowercased by the app
  password_hash text not null,
  first_name text not null default '',
  last_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visitors_tenant_email_unique unique (tenant_id, email)
);

create index if not exists visitors_tenant_idx on public.visitors (tenant_id);

-- Opaque session tokens. The cookie holds the raw token; we only ever store its
-- SHA-256 hash, so a leaked DB row can't be replayed as a session.
create table if not exists public.visitor_sessions (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  visitor_id uuid not null references public.visitors(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists visitor_sessions_visitor_idx
  on public.visitor_sessions (visitor_id);
create index if not exists visitor_sessions_expires_idx
  on public.visitor_sessions (expires_at);

-- SCRUM-178: link a captured lead to the visitor account that produced it.
alter table public.leads
  add column if not exists visitor_id uuid references public.visitors(id) on delete set null;
create index if not exists leads_visitor_idx
  on public.leads (visitor_id) where visitor_id is not null;

-- Let a loyalty account point back at a visitor, so the account page can resolve
-- balance by the signed-in visitor rather than only by email/phone.
alter table public.loyalty_accounts
  add column if not exists visitor_id uuid references public.visitors(id) on delete set null;
create unique index if not exists loyalty_accounts_tenant_visitor_idx
  on public.loyalty_accounts (tenant_id, visitor_id) where visitor_id is not null;

-- ─── RLS: deny-all (service-role only) ───────────────────────────────────────
alter table public.visitors enable row level security;
alter table public.visitor_sessions enable row level security;
-- No policies on purpose: these hold credentials + live sessions and are only
-- ever read/written by trusted server routes via the service-role client.
