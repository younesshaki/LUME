-- 089_atomic_quota_check.sql
--
-- The public request path used to read subscriptions, read plan limits and
-- then reserve usage in separate round trips. This service-role-only function
-- resolves the active plan and reserves the request in one database call so a
-- chat request cannot spend two transatlantic trips before any useful work.
--
-- It preserves the existing safety policy: incomplete or malformed billing
-- metadata is metered but never blocks an otherwise healthy tenant site.

create or replace function public.check_and_consume_usage_quota(
  p_tenant_id uuid,
  p_event_type text
)
returns table (
  allowed boolean,
  reason text,
  usage_count bigint,
  quota_limit bigint,
  resets_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limits jsonb;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_limit_text text;
  v_limit bigint;
  v_state text := 'unconfigured';
  v_bucket date;
  v_usage bigint;
  v_allowed boolean;
  v_resets_at timestamptz;
begin
  if p_tenant_id is null then
    raise exception 'Tenant ID is required';
  end if;
  if p_event_type is null or p_event_type not in (
    'chat_requests',
    'vehicle_requests',
    'bot_action_requests',
    'lead_requests'
  ) then
    raise exception 'Unsupported usage event type';
  end if;

  -- The partial unique index on subscriptions guarantees only one row is
  -- operational at a time. Keep the status order as a defensive tie-break for
  -- databases created before that constraint existed.
  select plan.limits, subscription.current_period_start, subscription.current_period_end
    into v_limits, v_period_start, v_period_end
  from public.subscriptions subscription
  join public.plans plan on plan.id = subscription.plan_id
  where subscription.tenant_id = p_tenant_id
    and subscription.status in ('active', 'trialing', 'past_due', 'incomplete')
  order by
    case subscription.status
      when 'active' then 0
      when 'trialing' then 1
      when 'past_due' then 2
      else 3
    end,
    subscription.created_at desc
  limit 1;

  if found then
    v_limit_text := case p_event_type
      when 'chat_requests' then coalesce(
        v_limits ->> 'chat_requests',
        v_limits ->> 'monthly_chat_requests',
        v_limits ->> 'chat_requests_per_month'
      )
      when 'vehicle_requests' then coalesce(
        v_limits ->> 'vehicle_requests',
        v_limits ->> 'monthly_vehicle_requests',
        v_limits ->> 'vehicle_requests_per_month'
      )
      when 'lead_requests' then coalesce(
        v_limits ->> 'lead_requests',
        v_limits ->> 'monthly_lead_requests',
        v_limits ->> 'lead_requests_per_month'
      )
      else null
    end;

    -- The application accepts only JavaScript-safe integral limits. Treat a
    -- malformed plan as unavailable enforcement, never as a surprise denial.
    if v_limit_text is not null then
      if v_limit_text !~ '^-?[0-9]{1,16}$' then
        v_state := 'fail_open';
      else
        v_limit := v_limit_text::bigint;
        if v_limit < 0 then
          v_state := 'unlimited';
        elsif v_period_start is not null and (
          v_period_end is null or v_period_end <= now()
        ) then
          v_state := 'fail_open';
        else
          v_state := 'configured';
        end if;
      end if;
    end if;
  end if;

  v_bucket := coalesce(
    (v_period_start at time zone 'utc')::date,
    date_trunc('month', now() at time zone 'utc')::date
  );
  if v_period_end is not null and v_period_end > now() then
    v_resets_at := v_period_end;
  elsif v_period_start is null then
    v_resets_at := date_trunc('month', now() at time zone 'utc')
      + interval '1 month';
  end if;

  -- Null and negative limits remain metered but do not deny. A zero limit
  -- intentionally avoids creating a counter row.
  insert into public.usage_events as usage (
    tenant_id,
    event_type,
    period_start,
    count
  )
  select p_tenant_id, p_event_type, v_bucket, 1
  where v_state <> 'configured' or v_limit < 0 or v_limit >= 1
  on conflict (tenant_id, event_type, period_start)
  do update set count = usage.count + 1
    where v_state <> 'configured' or v_limit < 0 or usage.count < v_limit
  returning usage.count into v_usage;

  if found then
    v_allowed := true;
  else
    select count into v_usage
    from public.usage_events
    where tenant_id = p_tenant_id
      and event_type = p_event_type
      and period_start = v_bucket;
    v_usage := coalesce(v_usage, 0);
    v_allowed := false;
  end if;

  if v_state = 'configured' and not v_allowed then
    return query select false, 'quota_exceeded', v_usage, v_limit, v_resets_at;
  elsif v_state = 'configured' then
    return query select true, 'within_limit', v_usage, v_limit, v_resets_at;
  elsif v_state = 'unlimited' then
    return query select true, 'unlimited', v_usage, v_limit, null::timestamptz;
  elsif v_state = 'unconfigured' then
    return query select true, 'unconfigured', v_usage, null::bigint, null::timestamptz;
  else
    return query select true, 'fail_open', v_usage, v_limit, v_resets_at;
  end if;
end;
$$;

revoke all on function public.check_and_consume_usage_quota(uuid, text)
  from public, anon, authenticated;
grant execute on function public.check_and_consume_usage_quota(uuid, text)
  to service_role;

comment on function public.check_and_consume_usage_quota(uuid, text) is
  'Resolves a tenant quota and atomically reserves one request in one service-role database call.';
