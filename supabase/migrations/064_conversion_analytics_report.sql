-- Conversion Engine v1 / Phase 3 follow-up. Additive aggregate read model.
-- This migration is intentionally not applied by this branch.

create or replace function public.tenant_conversion_report(
  p_tenant_id uuid,
  p_since timestamptz
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  report jsonb;
begin
  if not (p_tenant_id in (select public.tenant_ids_for_current_user())) then
    raise exception 'not authorized for tenant analytics';
  end if;

  with scoped as materialized (
    select event_name, visitor_id, anonymous_session_id, vehicle_id,
      utm_source, utm_campaign, occurred_at
    from public.conversion_events
    where tenant_id = p_tenant_id and occurred_at >= p_since
  ), funnel as (
    select event_name, count(*)::bigint as event_count,
      count(distinct coalesce(visitor_id::text, anonymous_session_id::text))::bigint as session_count
    from scoped group by event_name
  ), vehicles as (
    select vehicle_id,
      count(*) filter (where event_name = 'vehicle_view')::bigint as view_count,
      count(*) filter (where event_name = 'inquiry_submitted')::bigint as submitted_lead_count,
      min(occurred_at) filter (where event_name = 'vehicle_view') as first_viewed_at,
      max(occurred_at) filter (where event_name = 'vehicle_view') as last_viewed_at
    from scoped where vehicle_id is not null group by vehicle_id
  ), sources as (
    select coalesce(nullif(utm_source, ''), 'direct') as source,
      coalesce(nullif(utm_campaign, ''), '(not set)') as campaign,
      count(*) filter (where event_name = 'vehicle_view')::bigint as view_count,
      count(*) filter (where event_name = 'inquiry_submitted')::bigint as submitted_lead_count,
      count(distinct coalesce(visitor_id::text, anonymous_session_id::text))::bigint as session_count
    from scoped group by 1, 2
  ), identities as (
    select case when visitor_id is null then 'anonymous' else 'registered' end as identity,
      count(*) filter (where event_name = 'vehicle_view')::bigint as view_count,
      count(*) filter (where event_name = 'vehicle_saved')::bigint as save_count,
      count(*) filter (where event_name = 'inquiry_submitted')::bigint as submitted_lead_count
    from scoped group by 1
  ), first_views as (
    select coalesce(visitor_id::text, 'anon:' || anonymous_session_id::text) as identity,
      vehicle_id, min(occurred_at) as first_viewed_at
    from scoped where event_name = 'vehicle_view' and vehicle_id is not null
      and (visitor_id is not null or anonymous_session_id is not null)
    group by 1, 2
  ), first_leads as (
    select coalesce(visitor_id::text, 'anon:' || anonymous_session_id::text) as identity,
      vehicle_id, min(occurred_at) as first_lead_at
    from scoped where event_name = 'inquiry_submitted' and vehicle_id is not null
      and (visitor_id is not null or anonymous_session_id is not null)
    group by 1, 2
  )
  select jsonb_build_object(
    'funnel', coalesce((select jsonb_agg(to_jsonb(f) order by f.event_name) from funnel f), '[]'::jsonb),
    'vehicles', coalesce((select jsonb_agg(to_jsonb(v) order by v.view_count desc, v.last_viewed_at desc nulls last) from vehicles v where v.view_count > 0), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(to_jsonb(s) order by s.submitted_lead_count desc, s.view_count desc, s.source) from sources s where s.view_count > 0 or s.submitted_lead_count > 0), '[]'::jsonb),
    'identities', coalesce((select jsonb_agg(to_jsonb(i) order by i.identity) from identities i), '[]'::jsonb),
    'median_view_to_lead_seconds', (select percentile_cont(0.5) within group (order by extract(epoch from (l.first_lead_at - v.first_viewed_at)))
      from first_views v join first_leads l using (identity, vehicle_id)
      where l.first_lead_at >= v.first_viewed_at)
  ) into report;
  return report;
end; $$;

revoke all on function public.tenant_conversion_report(uuid, timestamptz) from public;
grant execute on function public.tenant_conversion_report(uuid, timestamptz) to authenticated;
