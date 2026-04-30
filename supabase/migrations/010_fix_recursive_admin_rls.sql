-- Replace the self-referential "admins read all profiles" policy with one that
-- uses the am_i_admin() SECURITY DEFINER function, which bypasses RLS on profiles
-- and eliminates the infinite recursion.
DROP POLICY IF EXISTS "admins read all profiles" ON profiles;
CREATE POLICY "admins read all profiles" ON profiles
  FOR SELECT
  USING (public.am_i_admin());

-- Same fix for story_events.
DROP POLICY IF EXISTS "admins read all events" ON story_events;
CREATE POLICY "admins read all events" ON story_events
  FOR SELECT
  USING (public.am_i_admin());
