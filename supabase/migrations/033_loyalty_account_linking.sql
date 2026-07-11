-- 033_loyalty_account_linking.sql
-- SCRUM-133 follow-up. Reuse an existing email-linked loyalty account when a
-- visitor begins accruing, preventing separate balances for the same person.

create or replace function public.accrue_loyalty_points(
  p_tenant_id uuid,
  p_visitor_id uuid,
  p_event_type text,
  p_idempotency_key text,
  p_description text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  applied boolean,
  points_delta integer,
  balance_after integer,
  transaction_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_email text;
  v_points integer;
  v_balance integer;
  v_event_id uuid;
  v_transaction_id uuid;
begin
  v_points := case p_event_type
    when 'chat_session' then 5
    when 'saved_vehicle' then 10
    when 'submitted_lead' then 50
    when 'referral' then 100
    else null
  end;

  if v_points is null then
    raise exception 'unsupported loyalty event type: %', p_event_type;
  end if;

  if nullif(trim(p_idempotency_key), '') is null then
    raise exception 'idempotency key is required';
  end if;

  select v.email
    into v_email
    from public.visitors v
    where v.id = p_visitor_id
      and v.tenant_id = p_tenant_id;

  if v_email is null then
    raise exception 'visitor not found for tenant';
  end if;

  select la.id
    into v_account_id
    from public.loyalty_accounts la
    where la.tenant_id = p_tenant_id
      and la.visitor_id = p_visitor_id
    limit 1;

  if v_account_id is null then
    select la.id
      into v_account_id
      from public.loyalty_accounts la
      where la.tenant_id = p_tenant_id
        and lower(la.email) = lower(v_email)
      order by la.updated_at desc
      limit 1;

    if v_account_id is not null then
      update public.loyalty_accounts
        set visitor_id = p_visitor_id
        where id = v_account_id
          and visitor_id is null;
    end if;
  end if;

  if v_account_id is null then
    insert into public.loyalty_accounts (tenant_id, visitor_id, email)
      values (p_tenant_id, p_visitor_id, v_email)
      on conflict (tenant_id, visitor_id) where visitor_id is not null do nothing
      returning id into v_account_id;

    if v_account_id is null then
      select la.id
        into v_account_id
        from public.loyalty_accounts la
        where la.tenant_id = p_tenant_id
          and la.visitor_id = p_visitor_id;
    end if;
  end if;

  select la.points_balance
    into v_balance
    from public.loyalty_accounts la
    where la.id = v_account_id
    for update;

  insert into public.loyalty_accrual_events (
    tenant_id,
    account_id,
    visitor_id,
    event_type,
    points_delta,
    idempotency_key,
    metadata
  ) values (
    p_tenant_id,
    v_account_id,
    p_visitor_id,
    p_event_type,
    v_points,
    trim(p_idempotency_key),
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (tenant_id, idempotency_key) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return query select false, 0, v_balance, null::uuid;
    return;
  end if;

  v_balance := v_balance + v_points;

  update public.loyalty_accounts
    set points_balance = v_balance
    where id = v_account_id;

  insert into public.loyalty_transactions (
    tenant_id,
    account_id,
    source,
    points_delta,
    balance_after,
    description,
    metadata
  ) values (
    p_tenant_id,
    v_account_id,
    case when p_event_type = 'submitted_lead' then 'lead' else 'adjustment' end,
    v_points,
    v_balance,
    coalesce(p_description, replace(p_event_type, '_', ' ')),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'eventType', p_event_type,
      'idempotencyKey', trim(p_idempotency_key),
      'accrualEventId', v_event_id
    )
  ) returning id into v_transaction_id;

  return query select true, v_points, v_balance, v_transaction_id;
end;
$$;

revoke all on function public.accrue_loyalty_points(uuid, uuid, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.accrue_loyalty_points(uuid, uuid, text, text, text, jsonb)
  to service_role;
