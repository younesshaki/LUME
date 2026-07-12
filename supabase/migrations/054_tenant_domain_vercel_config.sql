-- 054_tenant_domain_vercel_config.sql
-- SCRUM-190. Bounded, non-secret Vercel project-domain state for support and
-- verification UI. Provider credentials remain server environment variables.

alter table public.tenant_domains
  add column if not exists vercel_config jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tenant_domains_vercel_config_object'
      and conrelid = 'public.tenant_domains'::regclass
  ) then
    alter table public.tenant_domains
      add constraint tenant_domains_vercel_config_object check (
        jsonb_typeof(vercel_config) = 'object'
        and pg_column_size(vercel_config) <= 32768
      );
  end if;
end;
$$;

comment on column public.tenant_domains.vercel_config is
  'Normalized non-secret Vercel domain/config response; empty when integration is not provisioned.';
