-- 063_conversion_events.sql
-- Conversion Engine v1 / Phase 3. Tenant-scoped append-only conversion events.

create table if not exists public.conversion_events (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  visitor_id uuid,
  anonymous_session_id uuid,
  vehicle_id uuid,
  event_name text not null check (event_name in (
    'inventory_view','search_performed','filter_applied','vehicle_view','vehicle_saved','vehicle_unsaved',
    'compare_added','compare_removed','inquiry_opened','inquiry_started','inquiry_submitted','chat_started','account_created'
  )),
  event_category text not null check (event_category in ('analytics','operational')),
  utm_source text, utm_medium text, utm_campaign text, utm_content text, referrer text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint conversion_events_tenant_event_unique unique (tenant_id, event_id),
  constraint conversion_events_visitor_tenant_fk foreign key (tenant_id, visitor_id)
    references public.visitors(tenant_id, id) on delete set null (visitor_id),
  constraint conversion_events_vehicle_tenant_fk foreign key (tenant_id, vehicle_id)
    references public.vehicles(tenant_id, id) on delete set null (vehicle_id)
);
create index if not exists conversion_events_tenant_occurred_idx on public.conversion_events (tenant_id, occurred_at desc);
create index if not exists conversion_events_tenant_vehicle_idx on public.conversion_events (tenant_id, vehicle_id, occurred_at desc) where vehicle_id is not null;
create index if not exists conversion_events_tenant_session_idx on public.conversion_events (tenant_id, anonymous_session_id, occurred_at desc) where anonymous_session_id is not null;
alter table public.conversion_events enable row level security;
create policy "conversion_events_select_member" on public.conversion_events for select to authenticated using (tenant_id in (select public.tenant_ids_for_current_user()));

create or replace function public.tenant_conversion_funnel(p_tenant_id uuid, p_since timestamptz)
returns table(event_name text, event_count bigint, session_count bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not (p_tenant_id in (select public.tenant_ids_for_current_user())) then
    raise exception 'not authorized for tenant analytics';
  end if;
  return query select e.event_name, count(*)::bigint,
    count(distinct coalesce(e.visitor_id::text, e.anonymous_session_id::text))::bigint
  from public.conversion_events e
  where e.tenant_id = p_tenant_id and e.occurred_at >= p_since
  group by e.event_name;
end; $$;
revoke all on function public.tenant_conversion_funnel(uuid, timestamptz) from public;
grant execute on function public.tenant_conversion_funnel(uuid, timestamptz) to authenticated;
