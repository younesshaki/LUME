-- Whenever a session_started event is logged for a user, update their profile's last_seen_at.
-- Doing this server-side ensures it always fires, regardless of any client-side races
-- or RLS issues. The trigger is SECURITY DEFINER so it bypasses RLS on profiles.

create or replace function public.update_last_seen_on_session_started()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.event_type = 'session_started' then
    update profiles set last_seen_at = NEW.created_at where id = NEW.user_id;
  end if;
  return NEW;
end;
$$;

drop trigger if exists update_last_seen_trigger on public.story_events;
create trigger update_last_seen_trigger
after insert on public.story_events
for each row execute function public.update_last_seen_on_session_started();

-- Backfill: pick the latest session_started event for each user and update their profile
update profiles p
set last_seen_at = sub.last_session
from (
  select user_id, max(created_at) as last_session
  from story_events
  where event_type = 'session_started'
  group by user_id
) sub
where sub.user_id = p.id and sub.last_session > p.last_seen_at;
