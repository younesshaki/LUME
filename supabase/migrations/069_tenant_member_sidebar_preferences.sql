-- Per-member Admin navigation preferences. These are intentionally scoped to
-- both the tenant and the authenticated user: one member's sidebar choice must
-- never affect colleagues or another tenant.
create table if not exists public.tenant_member_preferences (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sidebar_single_expand boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id),
  foreign key (tenant_id, user_id)
    references public.tenant_members(tenant_id, user_id)
    on delete cascade
);

alter table public.tenant_member_preferences enable row level security;

create policy "tenant_member_preferences_select_own" on public.tenant_member_preferences
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and tenant_id in (select public.tenant_ids_for_current_user())
  );

create policy "tenant_member_preferences_insert_own" on public.tenant_member_preferences
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and tenant_id in (select public.tenant_ids_for_current_user())
  );

create policy "tenant_member_preferences_update_own" on public.tenant_member_preferences
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and tenant_id in (select public.tenant_ids_for_current_user())
  )
  with check (
    user_id = (select auth.uid())
    and tenant_id in (select public.tenant_ids_for_current_user())
  );

create trigger tenant_member_preferences_set_updated_at
  before update on public.tenant_member_preferences
  for each row execute function public.set_updated_at();

comment on table public.tenant_member_preferences is
  'Per-user, tenant-scoped Admin UI preferences.';
