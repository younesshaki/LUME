-- 055_domain_verification_polling.sql
-- SCRUM-192. Additive verification lifecycle and a service-only claim lease.

alter table public.tenant_domains
  add column if not exists verification_status text,
  add column if not exists verification_checked_at timestamptz,
  add column if not exists verification_failed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tenant_domains_verification_status_valid'
      and conrelid = 'public.tenant_domains'::regclass
  ) then
    alter table public.tenant_domains
      add constraint tenant_domains_verification_status_valid check (
        verification_status is null
        or verification_status in ('pending', 'verified', 'failed')
      );
  end if;
end;
$$;

create index if not exists tenant_domains_verification_due_idx
  on public.tenant_domains (verification_checked_at, created_at)
  where verified = false
    and (verification_status is null or verification_status = 'pending');

create or replace function public.claim_tenant_domains_for_verification(
  p_limit integer default 50
)
returns table (
  id uuid,
  tenant_id uuid,
  domain text,
  verified boolean,
  verification_token text,
  vercel_config jsonb,
  verification_status text,
  verification_checked_at timestamptz,
  verification_failed_at timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  with due as (
    select candidate.id
    from public.tenant_domains candidate
    where candidate.verified = false
      and (candidate.verification_status is null or candidate.verification_status = 'pending')
      and (
        candidate.verification_checked_at is null
        or candidate.verification_checked_at <= now() - interval '5 minutes'
      )
    order by candidate.verification_checked_at nulls first, candidate.created_at, candidate.id
    for update skip locked
    limit least(greatest(p_limit, 1), 100)
  ), claimed as (
    update public.tenant_domains domain_row
      set verification_checked_at = now(),
          verification_status = coalesce(domain_row.verification_status, 'pending')
      from due
      where domain_row.id = due.id
      returning domain_row.*
  )
  select claimed.id, claimed.tenant_id, claimed.domain, claimed.verified,
    claimed.verification_token, claimed.vercel_config,
    claimed.verification_status, claimed.verification_checked_at,
    claimed.verification_failed_at, claimed.created_at
  from claimed;
$$;

revoke all on function public.claim_tenant_domains_for_verification(integer)
  from public, anon, authenticated;
grant execute on function public.claim_tenant_domains_for_verification(integer)
  to service_role;

comment on column public.tenant_domains.verification_status is
  'Null for legacy rows; pending, verified, or failed for managed Vercel checks.';
