-- Public-callable existence check that bypasses RLS on profiles.
-- Only returns boolean — never exposes user_ids, emails, or any other data.
create or replace function public.username_exists(p_username text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists(select 1 from profiles where username = p_username);
$$;

grant execute on function public.username_exists(text) to anon, authenticated;
