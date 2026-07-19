-- Tenant-scoped, trusted-server-managed destinations the AI Concierge may use.
-- Product defaults remain source-controlled; rows here are tenant overrides or
-- validated custom targets. Members may inspect their registry, while all
-- writes go through owner/admin-authorized Admin server operations.

create table if not exists public.concierge_targets (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key text not null
    check (
      char_length(key) between 2 and 64
      and key ~ '^[a-z][a-z0-9-]+$'
    ),
  label text not null check (char_length(btrim(label)) between 1 and 80),
  kind text not null
    check (kind in ('route', 'section-anchor', 'form', 'modal')),
  destination text not null
    check (
      char_length(destination) between 1 and 300
      and destination like '/%'
      and destination not like '//%'
      and destination !~ '[[:space:]\\]'
      and position('%' in destination) = 0
      and destination not like '%://%'
      and destination not like '%?%'
      and destination !~ '(^|/)\.{1,2}(/|#|$)'
      and destination <> '/admin'
      and destination not like '/admin/%'
      and destination <> '/api'
      and destination not like '/api/%'
    ),
  ai_description text not null
    check (char_length(btrim(ai_description)) between 1 and 500),
  is_conversion boolean not null default false,
  enabled boolean not null default true,
  example_prompts text[] not null default '{}'
    check (
      cardinality(example_prompts) <= 6
      and char_length(array_to_string(example_prompts, '')) <= 960
    ),
  sort_order integer not null default 0 check (sort_order between 0 and 9999),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint concierge_targets_tenant_key_unique unique (tenant_id, key)
);

create index if not exists concierge_targets_tenant_enabled_sort_idx
  on public.concierge_targets (tenant_id, enabled, sort_order, key);
create index if not exists concierge_targets_created_by_idx
  on public.concierge_targets (created_by)
  where created_by is not null;
create index if not exists concierge_targets_updated_by_idx
  on public.concierge_targets (updated_by)
  where updated_by is not null;

alter table public.concierge_targets enable row level security;

drop policy if exists "concierge_targets_select_member"
  on public.concierge_targets;
create policy "concierge_targets_select_member"
  on public.concierge_targets
  for select
  to authenticated
  using (tenant_id in (select public.tenant_ids_for_current_user()));

-- Explicit Data API privileges: authenticated members can read only through
-- RLS. There is intentionally no browser INSERT/UPDATE/DELETE policy.
revoke all on table public.concierge_targets from anon, authenticated;
grant select on table public.concierge_targets to authenticated;
grant all on table public.concierge_targets to service_role;

drop trigger if exists concierge_targets_set_updated_at
  on public.concierge_targets;
create trigger concierge_targets_set_updated_at
  before update on public.concierge_targets
  for each row execute function public.set_updated_at();

comment on table public.concierge_targets is
  'Validated tenant overrides and custom public destinations available to the AI Concierge.';
