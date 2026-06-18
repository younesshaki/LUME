-- 019_tenant_theme.sql
-- Adds tenant-scoped public theme settings without exposing the tenants table.

alter table public.tenants
  add column if not exists theme jsonb not null default '{}'::jsonb;

create or replace function public.get_tenant_theme(p_slug text)
returns table (
  theme jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(t.theme, '{}'::jsonb) as theme
  from public.tenants t
  where t.slug = p_slug
    and t.status = 'active'
  limit 1;
$$;

grant execute on function public.get_tenant_theme(text) to anon, authenticated;
