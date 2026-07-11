-- 030_billing_schema.sql
-- SCRUM-102. Additive billing foundation only; no provider integration and no
-- seed data. Service-role processes own writes. Tenant members can read their
-- tenant's subscription and invoices.

create table if not exists public.plans (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  monthly_price_cents integer not null default 0 check (monthly_price_cents >= 0),
  limits jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  status text not null default 'inactive'
    check (status in ('inactive', 'trialing', 'active', 'past_due', 'canceled', 'incomplete')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  stripe_subscription_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_period_order check (
    current_period_start is null
    or current_period_end is null
    or current_period_end >= current_period_start
  )
);

create unique index if not exists subscriptions_tenant_active_idx
  on public.subscriptions (tenant_id)
  where status in ('trialing', 'active', 'past_due', 'incomplete');
create index if not exists subscriptions_tenant_idx
  on public.subscriptions (tenant_id);

create table if not exists public.invoices (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 0),
  status text not null default 'draft'
    check (status in ('draft', 'open', 'paid', 'void', 'uncollectible')),
  stripe_invoice_id text unique,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists invoices_tenant_created_idx
  on public.invoices (tenant_id, created_at desc);
create index if not exists invoices_subscription_idx
  on public.invoices (subscription_id);

alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.invoices enable row level security;

create policy "plans_select_member" on public.plans
  for select to authenticated
  using (exists (select 1 from public.tenant_ids_for_current_user()));

create policy "subscriptions_select_member" on public.subscriptions
  for select to authenticated
  using (tenant_id in (select public.tenant_ids_for_current_user()));

create policy "invoices_select_member" on public.invoices
  for select to authenticated
  using (tenant_id in (select public.tenant_ids_for_current_user()));

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

comment on table public.plans is
  'Platform billing plan definitions. Writes are service-role only.';
comment on table public.subscriptions is
  'Tenant billing subscriptions. Provider synchronization is implemented separately.';
comment on table public.invoices is
  'Tenant invoice summaries synchronized by a trusted billing provider worker.';
