-- 056_custom_domain_plan_limits.sql
-- SCRUM-193. Service-only atomic domain reservation against plan JSON limits.

create or replace function public.tenant_custom_domain_limit(p_tenant_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_plan_name text;
  v_limits jsonb;
  v_raw jsonb;
  v_limit integer;
begin
  select subscription.status, plan.name, plan.limits
    into v_status, v_plan_name, v_limits
  from public.subscriptions subscription
  join public.plans plan on plan.id = subscription.plan_id
  where subscription.tenant_id = p_tenant_id
    and subscription.status in ('trialing', 'active', 'past_due', 'incomplete')
  order by case subscription.status
    when 'active' then 0 when 'past_due' then 1 when 'incomplete' then 2 else 3 end,
    subscription.created_at desc
  limit 1;

  if v_status is null or v_status = 'trialing' then
    return 0;
  end if;

  v_raw := coalesce(
    v_limits -> 'custom_domains',
    v_limits -> 'custom_domain_limit',
    v_limits -> 'domains'
  );
  if jsonb_typeof(v_raw) = 'number'
    and v_raw #>> '{}' ~ '^-?[0-9]+$'
    and char_length(v_raw #>> '{}') <= 6 then
    v_limit := (v_raw #>> '{}')::integer;
    if v_limit between -1 and 10000 then return v_limit; end if;
  end if;

  if lower(v_plan_name) like '%enterprise%' then return -1; end if;
  if lower(v_plan_name) ~ '(^|[^a-z])pro([^a-z]|$)' then return 1; end if;
  return 0;
end;
$$;

create or replace function public.create_tenant_domain_with_limit(
  p_tenant_id uuid,
  p_domain text,
  p_vercel_config jsonb default '{}'::jsonb,
  p_verification_status text default 'pending',
  p_verified boolean default false,
  p_verification_checked_at timestamptz default null
)
returns table (
  outcome text,
  domain_id uuid,
  domain_limit integer,
  domain_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer;
  v_count integer;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 193));
  v_limit := public.tenant_custom_domain_limit(p_tenant_id);
  select count(*)::integer into v_count
  from public.tenant_domains where tenant_id = p_tenant_id;

  if v_limit >= 0 and v_count >= v_limit then
    return query select 'limit_exceeded'::text, null::uuid, v_limit, v_count;
    return;
  end if;

  insert into public.tenant_domains (
    tenant_id, domain, verified, vercel_config, verification_status,
    verification_checked_at
  ) values (
    p_tenant_id, p_domain, p_verified, coalesce(p_vercel_config, '{}'::jsonb),
    p_verification_status, p_verification_checked_at
  )
  on conflict (domain) do nothing
  returning id into v_id;

  if v_id is null then
    return query select 'domain_conflict'::text, null::uuid, v_limit, v_count;
    return;
  end if;
  return query select 'created'::text, v_id, v_limit, v_count + 1;
end;
$$;

revoke all on function public.tenant_custom_domain_limit(uuid)
  from public, anon, authenticated;
revoke all on function public.create_tenant_domain_with_limit(
  uuid, text, jsonb, text, boolean, timestamptz
) from public, anon, authenticated;
grant execute on function public.tenant_custom_domain_limit(uuid) to service_role;
grant execute on function public.create_tenant_domain_with_limit(
  uuid, text, jsonb, text, boolean, timestamptz
) to service_role;

comment on function public.create_tenant_domain_with_limit is
  'Atomically reserves a custom domain under the active plan allowance.';
