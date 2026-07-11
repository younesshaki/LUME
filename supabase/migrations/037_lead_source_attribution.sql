-- 037_lead_source_attribution.sql
-- SCRUM-174. Complete first-touch UTM attribution and bounded bot trigger
-- context for leads. Existing attribution columns remain unchanged.

alter table public.leads
  add column if not exists utm_content text,
  add column if not exists source_context jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leads_source_context_object'
      and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_source_context_object
      check (source_context is null or jsonb_typeof(source_context) = 'object');
  end if;
end
$$;

create index if not exists leads_tenant_source_created_idx
  on public.leads (tenant_id, source, created_at desc);

comment on column public.leads.utm_content is
  'First-touch UTM content captured by the public site.';
comment on column public.leads.source_context is
  'Sanitized trigger context such as bot action type and optional vehicle ID.';
