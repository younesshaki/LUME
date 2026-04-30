-- Story progress persistence table
-- One row per viewer, keyed by Supabase Auth user ID

create table story_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Backend schema version
  version integer not null default 1,

  -- Story/content compatibility version
  content_version text not null default 'v1',

  -- Current location
  current_part_id text not null default 'part-1',
  current_chapter_id text not null default 'part-1-chapter-1',
  current_scene_id text,

  -- Progress arrays
  visited_scene_ids text[] not null default '{}',
  completed_scene_ids text[] not null default '{}',
  completed_chapter_ids text[] not null default '{}',

  -- Flexible story state
  flags jsonb not null default '{}',
  choices jsonb not null default '[]',
  achievements jsonb not null default '{}',
  preferences jsonb not null default '{"soundEnabled": true}',

  -- Resume pointer
  resume_checkpoint jsonb,

  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(user_id)
);

-- Row-Level Security
alter table story_states enable row level security;

create policy "viewer reads own state"
  on story_states for select
  using (auth.uid() = user_id);

create policy "viewer writes own state"
  on story_states for insert
  with check (auth.uid() = user_id);

create policy "viewer updates own state"
  on story_states for update
  using (auth.uid() = user_id);
