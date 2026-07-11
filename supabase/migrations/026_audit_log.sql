-- 026_audit_log.sql
-- Epic D (SaaS Ops) — SCRUM-197 / D-NEW-9.
-- Append-only audit trail for security-relevant write operations (lead exports,
-- GDPR erasures, role changes, …). Rows are written server-side with the
-- service-role key (which bypasses RLS), so there is intentionally NO client
-- insert/update/delete policy. Reads are restricted to owner/admin — an audit
-- log an editor can't see is the whole point.

create table if not exists public.audit_log (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- null when the action has no signed-in actor (e.g. a public GDPR request).
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,          -- e.g. 'lead.export', 'gdpr.delete'
  resource_type text not null,   -- e.g. 'lead', 'visitor'
  resource_id text,              -- text: not every resource has a uuid id
  metadata jsonb not null default '{}'::jsonb,
  ip_addr inet,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_tenant_created_idx
  on public.audit_log (tenant_id, created_at desc);
create index if not exists audit_log_tenant_resource_idx
  on public.audit_log (tenant_id, resource_type, resource_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.audit_log enable row level security;

-- Read: owner/admin of the tenant only. No write policies exist, so the API
-- (anon/authenticated roles) can never insert, update, or delete — the table is
-- append-only from the service role alone.
drop policy if exists "audit_log_select_admin" on public.audit_log;
create policy "audit_log_select_admin" on public.audit_log
  for select
  using (public.user_has_tenant_role(tenant_id, array['owner', 'admin']));
