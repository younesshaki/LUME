-- 047_quota_enforcement.sql
-- SCRUM-104. Atomically reserve one request against a tenant quota. Plan
-- lookup stays in trusted application code so limits can be cached for five
-- minutes; this service-only RPC owns the concurrency-sensitive increment.

create or replace function public.consume_usage_event(
  p_tenant_id uuid,
  p_event_type text,
  p_limit bigint,
  p_period_start date default null
)
returns table (
  allowed boolean,
  usage_count bigint,
  period_start date
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_period date;
  next_count bigint;
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

  normalized_period := p_period_start;
  if normalized_period is null then
    select (s.current_period_start at time zone 'utc')::date
    into normalized_period
    from public.subscriptions s
    where s.tenant_id = p_tenant_id
      and s.status in ('active', 'trialing', 'past_due', 'incomplete')
      and s.current_period_start is not null
    order by
      case s.status
        when 'active' then 0
        when 'trialing' then 1
        when 'past_due' then 2
        else 3
      end,
      s.created_at desc
    limit 1;
  end if;
  normalized_period := coalesce(
    normalized_period,
    date_trunc('month', now() at time zone 'utc')::date
  );

  -- INSERT handles the first request in a period; the conflict update is
  -- serialized by PostgreSQL and rechecks the limit after taking the row lock.
  -- Null/negative limits mean unlimited but remain metered. A zero limit skips
  -- both branches and returns a denial without creating a counter row.
  insert into public.usage_events as usage (
    tenant_id,
    event_type,
    period_start,
    count
  )
  select
    p_tenant_id,
    p_event_type,
    normalized_period,
    1
  where p_limit is null or p_limit < 0 or p_limit >= 1
  on conflict (tenant_id, event_type, period_start)
  do update
    set count = usage.count + 1
    where p_limit is null
       or p_limit < 0
       or usage.count < p_limit
  returning usage.count into next_count;

  if found then
    return query select true, next_count, normalized_period;
    return;
  end if;

  select existing.count
  into next_count
  from public.usage_events existing
  where existing.tenant_id = p_tenant_id
    and existing.event_type = p_event_type
    and existing.period_start = normalized_period;

  return query select false, coalesce(next_count, 0), normalized_period;
end;
$$;

revoke all on function public.consume_usage_event(uuid, text, bigint, date)
  from public, anon, authenticated;
grant execute on function public.consume_usage_event(uuid, text, bigint, date)
  to service_role;

comment on function public.consume_usage_event(uuid, text, bigint, date) is
  'Atomically reserves one tenant request without exceeding a configured billing-period quota.';
