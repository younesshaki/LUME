-- 050_consent_events.sql
-- SCRUM-200 (D-NEW-12). Anonymous, tenant-scoped ledger of cookie-consent
-- choices so tenants can demonstrate analytics opt-in compliance and see
-- accept/reject rates. Deliberately stores NO ip, NO user agent, NO visitor
-- linkage — a consent record must not itself become tracking. Written
-- server-side via the service-role client; members read their tenant's rows.

create table if not exists public.consent_events (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  choice text not null check (choice in ('accepted', 'rejected')),
  consent_version integer not null default 1 check (consent_version >= 1),
  created_at timestamptz not null default now()
);

create index if not exists consent_events_tenant_created_idx
  on public.consent_events (tenant_id, created_at desc);

alter table public.consent_events enable row level security;

drop policy if exists "consent_events_select_member" on public.consent_events;
create policy "consent_events_select_member" on public.consent_events
  for select
  using (tenant_id in (select public.tenant_ids_for_current_user()));
