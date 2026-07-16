-- Customer 360 saved-vehicle correctness.
--
-- Current state remains in visitor_saved_vehicles. Trusted save/unsave
-- transitions are appended to conversion_events in the same transaction.

alter table public.conversion_events
  add column if not exists vehicle_title text;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
      where conrelid = 'public.conversion_events'::regclass
        and conname = 'conversion_events_vehicle_title_length_check'
  ) then
    alter table public.conversion_events
      add constraint conversion_events_vehicle_title_length_check
      check (vehicle_title is null or char_length(vehicle_title) <= 300);
  end if;
end;
$$;

-- Preserve a useful title for trusted historical saves that predate this RPC.
update public.conversion_events e
  set vehicle_title = left(
    concat_ws(
      ' ',
      v.year::text,
      nullif(btrim(v.make), ''),
      nullif(btrim(v.model), ''),
      nullif(btrim(v.trim), '')
    ),
    300
  )
  from public.vehicles v
  where e.tenant_id = v.tenant_id
    and e.vehicle_id = v.id
    and e.event_category = 'operational'
    and e.event_name in ('vehicle_saved', 'vehicle_unsaved')
    and e.vehicle_title is null;

create or replace function public.mutate_visitor_saved_vehicle(
  p_tenant_id uuid,
  p_visitor_id uuid,
  p_vehicle_id uuid,
  p_operation text
)
returns table (
  changed boolean,
  saved_id uuid,
  vehicle_id uuid,
  saved_at timestamptz,
  operational_event_id uuid
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_saved_id uuid;
  v_saved_at timestamptz;
  v_event_id uuid;
  v_vehicle_title text;
  v_vehicle_status text;
begin
  if p_operation not in ('save', 'unsave') then
    raise exception 'unsupported saved vehicle operation'
      using errcode = '22023';
  end if;

  -- The trusted visitor route resolves the signed session before invoking this
  -- function. This relationship check is defense in depth and prevents a
  -- service caller from crossing tenant/visitor boundaries.
  perform 1
    from public.visitors visitor
    where visitor.tenant_id = p_tenant_id
      and visitor.id = p_visitor_id
    for key share;
  if not found then
    raise exception 'visitor not found for tenant'
      using errcode = '23503';
  end if;

  if p_operation = 'unsave' then
    select saved.id, saved.created_at
      into v_saved_id, v_saved_at
      from public.visitor_saved_vehicles saved
      where saved.tenant_id = p_tenant_id
        and saved.visitor_id = p_visitor_id
        and saved.vehicle_id = p_vehicle_id
      for update;

    if not found then
      return query
        select false, null::uuid, p_vehicle_id, null::timestamptz, null::uuid;
      return;
    end if;
  end if;

  select
      left(
        concat_ws(
          ' ',
          vehicle.year::text,
          nullif(btrim(vehicle.make), ''),
          nullif(btrim(vehicle.model), ''),
          nullif(btrim(vehicle.trim), '')
        ),
        300
      ),
      vehicle.status
    into v_vehicle_title, v_vehicle_status
    from public.vehicles vehicle
    where vehicle.tenant_id = p_tenant_id
      and vehicle.id = p_vehicle_id
    for key share;

  if not found then
    raise exception 'vehicle not found for tenant'
      using errcode = '23503';
  end if;

  if p_operation = 'save' then
    if v_vehicle_status <> 'live' then
      raise exception 'vehicle is unavailable'
        using errcode = '22023';
    end if;

    insert into public.visitor_saved_vehicles as saved (
      tenant_id,
      visitor_id,
      vehicle_id
    ) values (
      p_tenant_id,
      p_visitor_id,
      p_vehicle_id
    )
    on conflict on constraint visitor_saved_vehicles_tenant_visitor_vehicle_unique do nothing
    returning saved.id, saved.created_at into v_saved_id, v_saved_at;

    if not found then
      select saved.id, saved.created_at
        into v_saved_id, v_saved_at
        from public.visitor_saved_vehicles saved
        where saved.tenant_id = p_tenant_id
          and saved.visitor_id = p_visitor_id
          and saved.vehicle_id = p_vehicle_id;

      return query
        select false, v_saved_id, p_vehicle_id, v_saved_at, null::uuid;
      return;
    end if;

    insert into public.conversion_events (
      tenant_id,
      visitor_id,
      vehicle_id,
      vehicle_title,
      event_name,
      event_category,
      metadata
    ) values (
      p_tenant_id,
      p_visitor_id,
      p_vehicle_id,
      v_vehicle_title,
      'vehicle_saved',
      'operational',
      '{}'::jsonb
    )
    returning event_id into v_event_id;

    return query
      select true, v_saved_id, p_vehicle_id, v_saved_at, v_event_id;
    return;
  end if;

  delete from public.visitor_saved_vehicles saved
    where saved.id = v_saved_id
      and saved.tenant_id = p_tenant_id
      and saved.visitor_id = p_visitor_id
      and saved.vehicle_id = p_vehicle_id;

  if not found then
    raise exception 'saved vehicle changed concurrently'
      using errcode = '40001';
  end if;

  insert into public.conversion_events (
    tenant_id,
    visitor_id,
    vehicle_id,
    vehicle_title,
    event_name,
    event_category,
    metadata
  ) values (
    p_tenant_id,
    p_visitor_id,
    p_vehicle_id,
    v_vehicle_title,
    'vehicle_unsaved',
    'operational',
    '{}'::jsonb
  )
  returning event_id into v_event_id;

  return query
    select true, v_saved_id, p_vehicle_id, v_saved_at, v_event_id;
end;
$$;

revoke all on function public.mutate_visitor_saved_vehicle(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.mutate_visitor_saved_vehicle(uuid, uuid, uuid, text)
  to service_role;

comment on column public.conversion_events.vehicle_title is
  'Bounded canonical vehicle title captured for trusted historical events.';
comment on function public.mutate_visitor_saved_vehicle(uuid, uuid, uuid, text) is
  'Atomically mutates current visitor saved-vehicle state and appends one trusted operational transition event.';
