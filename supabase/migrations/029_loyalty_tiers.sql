-- 029_loyalty_tiers.sql
-- Epic H — SCRUM-134. Per-tenant loyalty tier definitions. A visitor's tier is
-- derived by finding the highest tier whose `threshold` their points_balance
-- meets. Editor+ configure tiers; any member can read them; the public account
-- page reads them server-side to render progress.

create table if not exists public.loyalty_tiers (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  threshold integer not null default 0 check (threshold >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loyalty_tiers_tenant_name_unique unique (tenant_id, name)
);

create index if not exists loyalty_tiers_tenant_threshold_idx
  on public.loyalty_tiers (tenant_id, threshold asc);

alter table public.loyalty_tiers enable row level security;

drop policy if exists "loyalty_tiers_select_member" on public.loyalty_tiers;
create policy "loyalty_tiers_select_member" on public.loyalty_tiers
  for select
  using (tenant_id in (select public.tenant_ids_for_current_user()));

drop policy if exists "loyalty_tiers_write_editor" on public.loyalty_tiers;
create policy "loyalty_tiers_write_editor" on public.loyalty_tiers
  for all
  using (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']))
  with check (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']));

drop trigger if exists loyalty_tiers_set_updated_at on public.loyalty_tiers;
create trigger loyalty_tiers_set_updated_at
  before update on public.loyalty_tiers
  for each row execute function public.set_updated_at();
