-- 046_usage_tracking.sql
-- SCRUM-103. Billing-period request counters plus daily storage snapshots.
-- Route writes use the service role and an atomic RPC; tenant members have
-- read-only visibility for billing and analytics.

create table if not exists public.usage_events (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event_type text not null,
  period_start date not null,
  count bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, event_type, period_start),
  constraint usage_events_type_allowed check (
    event_type in (
      'chat_requests',
      'vehicle_requests',
      'bot_action_requests',
      'lead_requests'
    )
  ),
  constraint usage_events_count_nonnegative check (count >= 0)
);

create index if not exists usage_events_tenant_period_idx
  on public.usage_events (tenant_id, period_start desc);

create table if not exists public.usage_snapshots (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  metric text not null,
  captured_on date not null default current_date,
  value bigint not null,
  object_count bigint not null default 0,
  source text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, metric, captured_on),
  constraint usage_snapshots_metric_allowed check (metric in ('r2_storage_bytes')),
  constraint usage_snapshots_value_nonnegative check (value >= 0),
  constraint usage_snapshots_object_count_nonnegative check (object_count >= 0),
  constraint usage_snapshots_source_bounded check (char_length(source) between 1 and 40),
  constraint usage_snapshots_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists usage_snapshots_tenant_metric_idx
  on public.usage_snapshots (tenant_id, metric, captured_on desc);

alter table public.usage_events enable row level security;
alter table public.usage_snapshots enable row level security;

drop policy if exists "usage_events_select_member" on public.usage_events;
create policy "usage_events_select_member" on public.usage_events
  for select to authenticated
  using (tenant_id in (select public.tenant_ids_for_current_user()));

drop policy if exists "usage_snapshots_select_member" on public.usage_snapshots;
create policy "usage_snapshots_select_member" on public.usage_snapshots
  for select to authenticated
  using (tenant_id in (select public.tenant_ids_for_current_user()));

drop trigger if exists usage_events_set_updated_at on public.usage_events;
create trigger usage_events_set_updated_at
  before update on public.usage_events
  for each row execute function public.set_updated_at();

drop trigger if exists usage_snapshots_set_updated_at on public.usage_snapshots;
create trigger usage_snapshots_set_updated_at
  before update on public.usage_snapshots
  for each row execute function public.set_updated_at();

create or replace function public.increment_usage_event(
  p_tenant_id uuid,
  p_event_type text,
  p_period_start date default null,
  p_increment integer default 1
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_period date;
  next_count bigint;
begin
  if p_event_type is null or p_event_type not in (
    'chat_requests',
    'vehicle_requests',
    'bot_action_requests',
    'lead_requests'
  ) then
    raise exception 'Unsupported usage event type';
  end if;
  if p_increment is null or p_increment < 1 or p_increment > 1000 then
    raise exception 'Usage increment must be between 1 and 1000';
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

  insert into public.usage_events (
    tenant_id,
    event_type,
    period_start,
    count
  ) values (
    p_tenant_id,
    p_event_type,
    normalized_period,
    p_increment
  )
  on conflict (tenant_id, event_type, period_start)
  do update set count = public.usage_events.count + excluded.count
  returning count into next_count;

  return next_count;
end;
$$;

revoke all on function public.increment_usage_event(uuid, text, date, integer)
  from public, anon, authenticated;
grant execute on function public.increment_usage_event(uuid, text, date, integer)
  to service_role;

comment on table public.usage_events is
  'Atomic billing-period request counters used by billing quotas and analytics.';
comment on table public.usage_snapshots is
  'Daily point-in-time tenant usage measurements such as R2 storage bytes.';
