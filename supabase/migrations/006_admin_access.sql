-- Admin flag on profiles. The owner can mark specific usernames as admin
-- to grant them read access to everyone's events, profiles, and story_states.
alter table profiles add column if not exists is_admin boolean not null default false;

-- Allow admins to SELECT every profile (needed to list viewers in the admin panel)
create policy "admins read all profiles"
  on profiles for select
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- Allow admins to SELECT every story_event
create policy "admins read all events"
  on story_events for select
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- Allow admins to SELECT every story_state
create policy "admins read all states"
  on story_states for select
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- Enable realtime on story_events so the admin panel updates live
alter publication supabase_realtime add table story_events;
