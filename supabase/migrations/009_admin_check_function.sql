-- A simple SECURITY DEFINER function the client can call to ask "am I an admin?"
-- Bypasses RLS, schema cache surprises, and any policy recursion issues.
create or replace function public.am_i_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select is_admin from profiles where id = auth.uid()),
    false
  );
$$;

grant execute on function public.am_i_admin() to authenticated;

-- Force a PostgREST schema reload in case the is_admin column from migration 006
-- still hasn't propagated to the client API surface.
notify pgrst, 'reload schema';
