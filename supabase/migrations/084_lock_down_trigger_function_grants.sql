-- 084_lock_down_trigger_function_grants.sql
-- Closes the two real findings from the security advisor sweep and removes
-- EXECUTE grants that never had a purpose.
--
-- Context: the advisor reports 25 anon_security_definer_function_executable
-- and 30 authenticated_security_definer_function_executable warnings. Most are
-- not defects — the linter cannot see that our SECURITY DEFINER functions
-- enforce tenant scope internally, which is the documented convention in
-- CLAUDE.md. Verified directly: calling tenant_conversion_report() and
-- tenant_conversion_funnel() as `anon` with a real tenant id raises
-- "not authorized for tenant analytics", so there is no cross-tenant read.
--
-- Two findings are real, and both are fixed here.

-- 1. update_last_seen_on_session is SECURITY DEFINER with no search_path set
--    at all (proconfig null). A SECURITY DEFINER function without a pinned
--    search_path runs attacker-controllable name resolution with the owner's
--    privileges — the exact shape of a search_path injection. Every other
--    trigger function in the schema already pins it; this one was missed.
--    Guarded by to_regprocedure because staging does not yet have this
--    function: it arrives with a migration production already has and staging
--    does not. The guard keeps this migration replayable on both.
do $$
begin
  if to_regprocedure('public.update_last_seen_on_session()') is not null then
    alter function public.update_last_seen_on_session() set search_path = public, pg_temp;
  end if;
end $$;

-- 2. valid_webhook_retry_seconds is only a CHECK-constraint helper and is not
--    SECURITY DEFINER, so the risk is lower, but a mutable search_path in a
--    constraint predicate is still worth pinning.
alter function public.valid_webhook_retry_seconds(integer[])
  set search_path = public, pg_temp;

-- 3. Trigger functions carry EXECUTE for public/anon/authenticated purely
--    because that is the PostgreSQL default. PostgreSQL already refuses a
--    direct call to a function returning `trigger`, so this is defense in
--    depth rather than a live hole — but the grant communicates an intent
--    that does not exist, and it is what keeps these functions showing up in
--    the advisor report.
--
--    Revoking is safe: a trigger fires in the context of the table owner and
--    does not consult the calling role's EXECUTE privilege.
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'assign_lead_round_robin',
    'bump_tenant_inventory_version',
    'enforce_lead_assignee_membership',
    'notify_admins_on_csv_import_completion',
    'notify_admins_on_new_lead',
    'prepare_vehicle_image_insert',
    'update_last_seen_on_session'
  ] loop
    if to_regprocedure(format('public.%I()', v_fn)) is not null then
      execute format(
        'revoke all on function public.%I() from public, anon, authenticated',
        v_fn
      );
    end if;
  end loop;
end $$;
