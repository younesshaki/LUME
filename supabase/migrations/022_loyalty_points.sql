-- 022_loyalty_points.sql
-- Schema-only loyalty foundation. No accrual engine is wired here yet.

create table if not exists public.loyalty_accounts (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  external_customer_id text,
  email text,
  phone text,
  points_balance integer not null default 0 check (points_balance >= 0),
  tier text not null default 'standard',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loyalty_accounts_contact_or_external check (
    lead_id is not null
    or external_customer_id is not null
    or email is not null
    or phone is not null
  )
);

create index if not exists loyalty_accounts_tenant_idx
  on public.loyalty_accounts (tenant_id);
create index if not exists loyalty_accounts_tenant_email_idx
  on public.loyalty_accounts (tenant_id, email)
  where email is not null;
create unique index if not exists loyalty_accounts_tenant_lead_idx
  on public.loyalty_accounts (tenant_id, lead_id)
  where lead_id is not null;
create unique index if not exists loyalty_accounts_tenant_external_customer_idx
  on public.loyalty_accounts (tenant_id, external_customer_id)
  where external_customer_id is not null;

comment on table public.loyalty_accounts is
  'Tenant-scoped loyalty account balances. Future accrual jobs should update points_balance only after inserting a matching loyalty_transactions row.';
comment on column public.loyalty_accounts.points_balance is
  'Current point balance derived from loyalty_transactions. Keep non-negative for redemption safety.';

create table if not exists public.loyalty_transactions (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  account_id uuid not null references public.loyalty_accounts(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  source text not null default 'manual'
    check (source in ('manual', 'lead', 'purchase', 'redemption', 'adjustment', 'expiration')),
  points_delta integer not null check (points_delta <> 0),
  balance_after integer not null check (balance_after >= 0),
  description text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists loyalty_transactions_tenant_idx
  on public.loyalty_transactions (tenant_id);
create index if not exists loyalty_transactions_account_occurred_idx
  on public.loyalty_transactions (account_id, occurred_at desc);
create index if not exists loyalty_transactions_tenant_source_idx
  on public.loyalty_transactions (tenant_id, source, occurred_at desc);

comment on table public.loyalty_transactions is
  'Immutable tenant-scoped loyalty ledger. Accrual should insert positive rows; redemptions, expirations, and corrections should insert negative rows.';
comment on column public.loyalty_transactions.points_delta is
  'Signed point movement. Accrual sources use positive values; redemption and expiration sources use negative values.';
comment on column public.loyalty_transactions.balance_after is
  'Account balance immediately after this transaction. Future engines should write this atomically with the account balance update.';

alter table public.loyalty_accounts enable row level security;
alter table public.loyalty_transactions enable row level security;

drop policy if exists "loyalty_accounts_select_member" on public.loyalty_accounts;
create policy "loyalty_accounts_select_member" on public.loyalty_accounts
  for select
  using (tenant_id in (select public.tenant_ids_for_current_user()));

drop policy if exists "loyalty_accounts_write_editor" on public.loyalty_accounts;
create policy "loyalty_accounts_write_editor" on public.loyalty_accounts
  for all
  using (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']))
  with check (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']));

drop policy if exists "loyalty_transactions_select_member" on public.loyalty_transactions;
create policy "loyalty_transactions_select_member" on public.loyalty_transactions
  for select
  using (tenant_id in (select public.tenant_ids_for_current_user()));

drop policy if exists "loyalty_transactions_write_editor" on public.loyalty_transactions;
create policy "loyalty_transactions_write_editor" on public.loyalty_transactions
  for all
  using (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']))
  with check (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']));

drop trigger if exists loyalty_accounts_set_updated_at on public.loyalty_accounts;
create trigger loyalty_accounts_set_updated_at
  before update on public.loyalty_accounts
  for each row execute function public.set_updated_at();
