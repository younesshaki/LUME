-- 045_visitor_profiles.sql
-- SCRUM-131. Private, tenant-scoped behavioral preferences learned from a
-- signed-in visitor's persisted chat sessions. Writes and reads are performed
-- only by the server service role; no browser-facing RLS policies are added.

-- Only turns observed by the canonical server chat route may influence a
-- learned profile. The legacy visitor history endpoint leaves this false, so
-- a browser cannot mark arbitrary text as trusted learning input.
alter table public.chat_messages
  add column if not exists is_server_observed boolean not null default false;

create index if not exists chat_messages_preference_learning_idx
  on public.chat_messages (tenant_id, session_id, created_at desc)
  where role = 'user' and is_server_observed;

create unique index if not exists visitors_tenant_id_id_unique_idx
  on public.visitors (tenant_id, id);

create table if not exists public.visitor_profiles (
  visitor_id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  learned_session_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visitor_profiles_preferences_object check (
    jsonb_typeof(preferences) = 'object'
  ),
  constraint visitor_profiles_session_count_nonnegative check (
    learned_session_count >= 0
  ),
  constraint visitor_profiles_tenant_visitor_unique unique (tenant_id, visitor_id),
  constraint visitor_profiles_visitor_tenant_fk foreign key (tenant_id, visitor_id)
    references public.visitors(tenant_id, id) on delete cascade
);

create index if not exists visitor_profiles_tenant_idx
  on public.visitor_profiles (tenant_id, updated_at desc);

alter table public.visitor_profiles enable row level security;

-- Intentionally no policies: behavioral profiles are private service-role
-- data. The service code always filters by both tenant_id and visitor_id.

drop trigger if exists visitor_profiles_set_updated_at on public.visitor_profiles;
create trigger visitor_profiles_set_updated_at
  before update on public.visitor_profiles
  for each row execute function public.set_updated_at();

comment on table public.visitor_profiles is
  'Private, normalized visitor preferences derived from three or more signed-in chat sessions.';
