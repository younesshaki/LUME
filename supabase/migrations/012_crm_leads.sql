-- 012_crm_leads.sql
-- Epic K (CRM & Lead Pipeline) foundation — SCRUM-167.
-- Tenant-scoped leads + lead_activities, with RLS following the same
-- conventions as 011: members read their tenant's rows; editor+ writes via
-- user_has_tenant_role(). Lead capture from the public site / bot happens
-- server-side with the service-role key, which bypasses RLS — so there is
-- intentionally NO anon insert policy here.

-- ─── Leads ───────────────────────────────────────────────────────────────────
create table if not exists public.leads (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source text not null default 'contact-form'
    check (source in ('chat', 'contact-form', 'test-drive', 'csv-import', 'api')),
  status text not null default 'new'
    check (status in ('new', 'contacted', 'qualified', 'won', 'lost')),
  assigned_to uuid references auth.users(id) on delete set null,
  first_name text default '',
  last_name text default '',
  email text,
  phone text,
  message text,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referrer text,
  ip_addr inet,
  user_agent text,
  lost_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A lead is only useful if we can reach the visitor.
  constraint leads_contactable check (email is not null or phone is not null)
);

create index if not exists leads_tenant_status_created_idx
  on public.leads (tenant_id, status, created_at desc);
create index if not exists leads_tenant_assigned_idx
  on public.leads (tenant_id, assigned_to);
create index if not exists leads_vehicle_idx
  on public.leads (vehicle_id) where vehicle_id is not null;

-- ─── Lead activities (timeline) ──────────────────────────────────────────────
create table if not exists public.lead_activities (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  type text not null
    check (type in ('note', 'call', 'email', 'status_change', 'assignment')),
  body text,
  created_at timestamptz not null default now()
);

create index if not exists lead_activities_lead_idx
  on public.lead_activities (lead_id, created_at desc);
create index if not exists lead_activities_tenant_idx
  on public.lead_activities (tenant_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.leads enable row level security;
alter table public.lead_activities enable row level security;

-- Leads: read for any member; write for editor+.
drop policy if exists "leads_select_member" on public.leads;
create policy "leads_select_member" on public.leads
  for select
  using (tenant_id in (select public.tenant_ids_for_current_user()));

drop policy if exists "leads_write_editor" on public.leads;
create policy "leads_write_editor" on public.leads
  for all
  using (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']))
  with check (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']));

-- Lead activities: read for any member; write for editor+.
drop policy if exists "lead_activities_select_member" on public.lead_activities;
create policy "lead_activities_select_member" on public.lead_activities
  for select
  using (tenant_id in (select public.tenant_ids_for_current_user()));

drop policy if exists "lead_activities_write_editor" on public.lead_activities;
create policy "lead_activities_write_editor" on public.lead_activities
  for all
  using (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']))
  with check (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']));

-- ─── updated_at trigger ──────────────────────────────────────────────────────
drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();
