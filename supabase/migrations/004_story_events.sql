-- Append-only events log for tracking every meaningful action a viewer takes.
-- Unlike story_states (single row per user, overwriting), this preserves a full history.
-- Used by the owner to see when viewers visited, where they got, and what they chose.

create table story_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text,
  event_type text not null,
  scene_id text,
  choice_id text,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index story_events_user_id_idx on story_events(user_id);
create index story_events_event_type_idx on story_events(event_type);
create index story_events_created_at_idx on story_events(created_at desc);

-- Row-Level Security: viewers can only INSERT their own events. No SELECT from clients.
-- The owner reads via Supabase dashboard / SQL editor / service_role.
alter table story_events enable row level security;

create policy "viewer inserts own events"
  on story_events for insert
  with check (auth.uid() = user_id);
