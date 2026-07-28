-- 085_converge_last_seen_trigger_function.sql
-- Removes a schema divergence between production and the migration chain.
--
-- Migration 008 defines public.update_last_seen_on_session_started(), and
-- staging runs exactly that. Production instead runs a function named
-- public.update_last_seen_on_session() — a name that appears in no migration
-- file. It was created directly against the database at some point, and it
-- shows: it shipped with no `set search_path` at all, which is why the
-- security advisor flagged it (fixed in 084) while staging's copy was clean.
--
-- The bodies also differ. 008 records the event's own timestamp:
--     set last_seen_at = NEW.created_at
-- The production copy records insert time instead:
--     SET last_seen_at = NOW()
-- For a live insert these differ by milliseconds, but NEW.created_at is the
-- correct value — it stays right if events are ever backfilled or replayed,
-- where NOW() would stamp every historical session with the import time.
--
-- Converge on the migration-defined function so the repo is the source of
-- truth in both environments, then drop the off-chain one. Written to be a
-- no-op on staging, which is already correct.

-- Recreate the canonical function (idempotent; matches 008, with pg_temp
-- appended to the search_path per the 084 hardening).
create or replace function public.update_last_seen_on_session_started()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if NEW.event_type = 'session_started' then
    update public.profiles
    set last_seen_at = NEW.created_at
    where id = NEW.user_id;
  end if;
  return NEW;
end;
$$;

revoke all on function public.update_last_seen_on_session_started()
  from public, anon, authenticated;

-- Repoint the trigger. Dropping and recreating is safe: story_events is
-- append-only telemetry and the trigger only mirrors a timestamp onto
-- profiles, so a momentary gap cannot corrupt anything.
drop trigger if exists update_last_seen_trigger on public.story_events;
create trigger update_last_seen_trigger
after insert on public.story_events
for each row execute function public.update_last_seen_on_session_started();

-- Drop the off-chain production-only function now that nothing references it.
drop function if exists public.update_last_seen_on_session();
