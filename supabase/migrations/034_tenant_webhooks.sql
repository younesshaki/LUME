-- 034_tenant_webhooks.sql
-- SCRUM-201. Tenant webhook configuration, isolated credentials, and durable
-- delivery attempts. No network calls are performed by this migration.

create table if not exists public.tenant_webhooks (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  endpoint_url text not null check (endpoint_url ~ '^https://'),
  events text[] not null default '{}'::text[],
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_webhooks_tenant_name_unique unique (tenant_id, name)
);

create table if not exists public.tenant_webhook_credentials (
  webhook_id uuid primary key references public.tenant_webhooks(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  signing_secret_ciphertext text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.webhook_deliveries (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  webhook_id uuid not null references public.tenant_webhooks(id) on delete cascade,
  event_type text not null
    check (event_type in ('lead.created', 'lead.status_changed', 'vehicle.sold', 'test_drive.scheduled')),
  event_id text not null,
  payload jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'delivering', 'retrying', 'succeeded', 'dead_letter')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  response_status integer,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint webhook_deliveries_webhook_event_unique unique (webhook_id, event_type, event_id)
);

create index if not exists tenant_webhooks_tenant_enabled_idx
  on public.tenant_webhooks (tenant_id, enabled);
create index if not exists webhook_deliveries_due_idx
  on public.webhook_deliveries (next_attempt_at)
  where status in ('pending', 'retrying');
create index if not exists webhook_deliveries_tenant_status_idx
  on public.webhook_deliveries (tenant_id, status, created_at desc);

alter table public.tenant_webhooks enable row level security;
alter table public.tenant_webhook_credentials enable row level security;
alter table public.webhook_deliveries enable row level security;

create policy "tenant_webhooks_select_member" on public.tenant_webhooks
  for select to authenticated
  using (tenant_id in (select public.tenant_ids_for_current_user()));

create policy "tenant_webhooks_write_editor" on public.tenant_webhooks
  for all to authenticated
  using (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']))
  with check (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']));

-- Deliberately no policy on tenant_webhook_credentials. Only trusted
-- service-role code may read or write encrypted signing material.

create policy "webhook_deliveries_select_member" on public.webhook_deliveries
  for select to authenticated
  using (tenant_id in (select public.tenant_ids_for_current_user()));

create trigger tenant_webhooks_set_updated_at
  before update on public.tenant_webhooks
  for each row execute function public.set_updated_at();
create trigger tenant_webhook_credentials_set_updated_at
  before update on public.tenant_webhook_credentials
  for each row execute function public.set_updated_at();
create trigger webhook_deliveries_set_updated_at
  before update on public.webhook_deliveries
  for each row execute function public.set_updated_at();

comment on table public.tenant_webhook_credentials is
  'Encrypted webhook signing material. RLS deny-all; service-role access only.';
comment on table public.webhook_deliveries is
  'Durable webhook delivery queue and dead-letter history.';
