-- ─── Platform admins (SaaS operator layer) ─────────────────────────────────
-- Members of this table operate the whole platform: they implicitly pass
-- every tenant's RLS (via the two extended helpers below) and see the
-- /admin/platform overview. Rows are managed by the operator only — there is
-- no client-side write path (service role / SQL only).

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

-- A user may check their own row (used nowhere critical — the UI uses the
-- is_platform_admin() function); nobody can write via the API.
drop policy if exists platform_admins_select_self on public.platform_admins;
create policy platform_admins_select_self
  on public.platform_admins for select
  using (user_id = auth.uid());

-- ─── is_platform_admin() ────────────────────────────────────────────────────
-- SECURITY DEFINER so RLS on platform_admins doesn't recurse; safe because it
-- only ever answers about auth.uid() itself.
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins where user_id = auth.uid()
  );
$$;

-- ─── Extend the tenant-scope helpers ────────────────────────────────────────
-- Platform admins are implicit members of every tenant with every role.
-- Everything downstream (RLS policies, admin pages) picks this up with no
-- further changes — this is the single enforcement point.

create or replace function public.tenant_ids_for_current_user()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.tenant_members where user_id = auth.uid()
  union
  select id from public.tenants where public.is_platform_admin();
$$;

create or replace function public.user_has_tenant_role(
  p_tenant_id uuid,
  p_roles text[]
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
    or exists (
      select 1
      from public.tenant_members
      where tenant_id = p_tenant_id
        and user_id = auth.uid()
        and role = any (p_roles)
    );
$$;

-- ─── Seed the founding platform admin ──────────────────────────────────────
insert into public.platform_admins (user_id)
values ('e89b6ac8-6e2f-42d4-9016-ede0950e77d2') -- hakicsi89@gmail.com
on conflict (user_id) do nothing;
