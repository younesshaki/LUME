-- 079_fix_claim_inventory_feed_runs_ambiguity.sql
-- Fixes a real bug hit on first live use: claim_inventory_feed_runs()
-- RETURNS TABLE(..., tenant_id uuid, ...), which makes `tenant_id` an
-- implicit PL/pgSQL variable throughout the function body. Its lease-upsert
-- does `on conflict (tenant_id)`, and Postgres cannot tell whether that bare
-- column reference means the OUT-parameter variable or
-- inventory_feed_tenant_leases.tenant_id — every claim attempt failed with
-- "column reference \"tenant_id\" is ambiguous" (42702).
--
-- Fix: `#variable_conflict use_column` as the function's first statement
-- tells plpgsql to prefer the table column over a same-named variable
-- whenever both are in scope, which is what every reference in this
-- function actually intends (the function never uses the bare `tenant_id`
-- OUT-parameter as a variable anywhere — it always qualifies with an
-- alias, e.g. v_run.tenant_id, v_candidate.tenant_id). No other function in
-- this schema combines a `tenant_id` OUT parameter with an `on conflict`
-- target of the same name; this is the only place the bug can occur.

create or replace function public.claim_inventory_feed_runs(
  p_limit integer default 25
)
returns table (
  id uuid,
  tenant_id uuid,
  feed_source_id uuid,
  run_trigger text,
  source_snapshot jsonb,
  attempt_count integer,
  credential_ciphertext text,
  retry_delays_seconds integer[],
  last_source_hash text,
  source_config_version integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_claim_count integer := 0;
  v_candidate record;
  v_run public.inventory_feed_runs%rowtype;
  v_acquired integer;
begin
  -- A serverless invocation that dies leaves both the run and lease behind.
  -- Claims reclaim them together after the same bounded lease interval.
  delete from public.inventory_feed_tenant_leases lease
  where lease.claimed_at <= now() - interval '15 minutes';

  for v_candidate in
    select run.id, run.tenant_id
    from public.inventory_feed_runs run
    join public.inventory_feed_sources source
      on source.id = run.feed_source_id
      and source.tenant_id = run.tenant_id
    left join public.inventory_feed_tenant_leases lease
      on lease.tenant_id = run.tenant_id
      and lease.claimed_at > now() - interval '15 minutes'
    where source.enabled = true
      and source.archived_at is null
      and lease.tenant_id is null
      and (
        (run.status in ('pending', 'retrying') and run.next_attempt_at <= now())
        or (
          run.status = 'processing'
          and run.updated_at <= now() - interval '15 minutes'
        )
    )
    order by run.next_attempt_at, run.id
    limit least(v_limit * 4, 100)
    for update of run, source skip locked
  loop
    exit when v_claim_count >= v_limit;

    v_acquired := null;
    insert into public.inventory_feed_tenant_leases (tenant_id, run_id, claimed_at)
    values (v_candidate.tenant_id, v_candidate.id, now())
    on conflict (tenant_id) do update
      set run_id = excluded.run_id,
          claimed_at = excluded.claimed_at
      where public.inventory_feed_tenant_leases.claimed_at <= now() - interval '15 minutes'
    returning 1 into v_acquired;
    if not found then
      continue;
    end if;

    update public.inventory_feed_runs run
    set
      status = 'processing',
      attempt_count = run.attempt_count + 1,
      claimed_at = now(),
      started_at = coalesce(run.started_at, now()),
      last_error = null
    where run.id = v_candidate.id
      and run.tenant_id = v_candidate.tenant_id
      and run.status in ('pending', 'retrying', 'processing')
    returning run.* into v_run;

    if not found then
      delete from public.inventory_feed_tenant_leases lease
      where lease.tenant_id = v_candidate.tenant_id
        and lease.run_id = v_candidate.id;
      continue;
    end if;

    v_claim_count := v_claim_count + 1;
    return query
    select
      v_run.id,
      v_run.tenant_id,
      v_run.feed_source_id,
      v_run.run_trigger,
      v_run.source_snapshot,
      v_run.attempt_count,
      credential.credential_ciphertext,
      coalesce(
        (
          select array_agg(retry_delay.value::integer order by retry_delay.ordinality)
          from jsonb_array_elements_text(
            v_run.source_snapshot -> 'retryDelaysSeconds'
          ) with ordinality as retry_delay(value, ordinality)
      ),
        source.retry_delays_seconds
      ),
      source.last_source_hash,
      source.config_version
    from public.inventory_feed_sources source
    left join public.inventory_feed_source_credentials credential
      on credential.feed_source_id = v_run.feed_source_id
      and credential.tenant_id = v_run.tenant_id
    where source.id = v_run.feed_source_id
      and source.tenant_id = v_run.tenant_id;
  end loop;
end;
$$;

-- create or replace does not preserve grants; re-assert service-only access.
revoke all on function public.claim_inventory_feed_runs(integer)
  from public, anon, authenticated;
grant execute on function public.claim_inventory_feed_runs(integer)
  to service_role;
