-- 028_visitor_chat_history.sql
-- Epic G — SCRUM-130. Persist a visitor's chat history per tenant so the bot
-- can pick up where they left off. Sessions optionally belong to a signed-in
-- visitor; messages hang off a session. Written server-side (service role);
-- tenant members may read for support/audit.

create table if not exists public.chat_sessions (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  visitor_id uuid references public.visitors(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_sessions_tenant_idx
  on public.chat_sessions (tenant_id, updated_at desc);
create index if not exists chat_sessions_visitor_idx
  on public.chat_sessions (visitor_id, updated_at desc) where visitor_id is not null;

create table if not exists public.chat_messages (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_session_idx
  on public.chat_messages (session_id, created_at asc);
create index if not exists chat_messages_tenant_idx
  on public.chat_messages (tenant_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

-- Members can read their tenant's chat history; writes come from the service
-- role only (public visitors have no Supabase session).
drop policy if exists "chat_sessions_select_member" on public.chat_sessions;
create policy "chat_sessions_select_member" on public.chat_sessions
  for select
  using (tenant_id in (select public.tenant_ids_for_current_user()));

drop policy if exists "chat_messages_select_member" on public.chat_messages;
create policy "chat_messages_select_member" on public.chat_messages
  for select
  using (tenant_id in (select public.tenant_ids_for_current_user()));

drop trigger if exists chat_sessions_set_updated_at on public.chat_sessions;
create trigger chat_sessions_set_updated_at
  before update on public.chat_sessions
  for each row execute function public.set_updated_at();
