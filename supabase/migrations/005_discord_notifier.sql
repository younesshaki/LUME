-- Enable async HTTP from Postgres
create extension if not exists pg_net;

-- Trigger function: posts a Discord message whenever a meaningful story_event is inserted.
-- Async fire-and-forget — does not block or roll back the INSERT if Discord is slow/down.
create or replace function public.notify_discord_on_story_event()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
declare
  -- Set this outside git, for example:
  -- alter database postgres set app.discord_webhook_url = '<discord webhook url>';
  webhook_url text := current_setting('app.discord_webhook_url', true);
  message text;
  iso_time text;
  unix_time bigint;
  resp_ms_text text;
begin
  if webhook_url is null or webhook_url = '' then
    return NEW;
  end if;

  iso_time := to_char(NEW.created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS"Z"');
  unix_time := extract(epoch from NEW.created_at)::bigint;
  resp_ms_text := coalesce(NEW.payload->>'responseTimeMs', 'unknown');

  if NEW.event_type = 'choice_made' then
    if NEW.choice_id = 'yes' then
      message := format(
        E'🎉 **%s** answered **YES** to productChoice!\n' ||
        E'Response time: %s ms\n' ||
        E'At: <t:%s:F> (%s)',
        coalesce(NEW.username, 'someone'),
        resp_ms_text,
        unix_time,
        iso_time
      );
    elsif NEW.choice_id = 'no' then
      message := format(
        E'💔 **%s** answered **NO** to productChoice.\n' ||
        E'Response time: %s ms\n' ||
        E'At: <t:%s:F> (%s)',
        coalesce(NEW.username, 'someone'),
        resp_ms_text,
        unix_time,
        iso_time
      );
    end if;
  elsif NEW.event_type = 'session_started' then
    message := format(
      E'👀 **%s** opened the site\n' ||
      E'At: <t:%s:F>',
      coalesce(NEW.username, 'someone'),
      unix_time
    );
  elsif NEW.event_type = 'registered' then
    message := format(
      E'✨ **%s** registered for the first time\n' ||
      E'At: <t:%s:F>',
      coalesce(NEW.username, 'someone'),
      unix_time
    );
  elsif NEW.event_type = 'chapter_completed' then
    message := format(
      E'🏁 **%s** finished the chapter (ending: **%s**)\n' ||
      E'At: <t:%s:F>',
      coalesce(NEW.username, 'someone'),
      coalesce(NEW.payload->>'ending', 'unknown'),
      unix_time
    );
  end if;

  if message is null then
    return NEW;
  end if;

  -- Fire-and-forget; swallow any error so the insert always succeeds
  begin
    perform net.http_post(
      url := webhook_url,
      body := jsonb_build_object('content', message),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  exception when others then
    raise warning 'Discord notification failed: %', sqlerrm;
  end;

  return NEW;
end;
$$;

drop trigger if exists notify_discord_on_story_event_trigger on public.story_events;
create trigger notify_discord_on_story_event_trigger
after insert on public.story_events
for each row execute function public.notify_discord_on_story_event();
