-- Viewer profiles table
-- Stores the chosen username linked to each Supabase Auth user

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Row-Level Security
alter table profiles enable row level security;

create policy "owner reads own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "owner inserts own profile"
  on profiles for insert
  with check (auth.uid() = id);

create policy "owner updates own profile"
  on profiles for update
  using (auth.uid() = id);
