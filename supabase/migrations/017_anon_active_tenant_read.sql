-- 017_anon_active_tenant_read.sql
-- Fixes the anon public-read policies so they actually return rows.
--
-- The anon SELECT policies on `vehicles` and `rag_chunks` checked
--   exists (select 1 from public.tenants t where t.id = ... and t.status = 'active')
-- but that subquery reads `public.tenants`, which anon has NO select policy for —
-- so the EXISTS was always false and anon saw zero rows. (Service-role callers
-- bypassed RLS, which is why nobody noticed.)
--
-- Fix: a SECURITY DEFINER helper that answers "is this tenant active?" without
-- exposing the tenants list to anon (so we keep tenant enumeration private,
-- unlike a blanket anon policy on `tenants`). Rewrite both anon policies to use it.

create or replace function public.tenant_is_active(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tenants
    where id = p_tenant_id and status = 'active'
  );
$$;

grant execute on function public.tenant_is_active(uuid) to anon, authenticated;

drop policy if exists "vehicles_select_public_active" on public.vehicles;
create policy "vehicles_select_public_active" on public.vehicles
  for select
  to anon
  using (public.tenant_is_active(tenant_id));

drop policy if exists "rag_chunks_select_public_active" on public.rag_chunks;
create policy "rag_chunks_select_public_active" on public.rag_chunks
  for select
  to anon
  using (public.tenant_is_active(tenant_id));
