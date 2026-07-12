-- 053_lead_email_notifications.sql
-- SCRUM-172. Default-off per-tenant lead email policy and durable hourly
-- digest batches. No email or external network call is performed here.

alter table public.tenant_settings
  add column if not exists lead_email_enabled boolean not null default false,
  add column if not exists lead_email_roles text[] not null default array['owner']::text[],
  add column if not exists lead_email_mode text not null default 'instant',
  add column if not exists lead_email_unassigned_address text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tenant_settings_lead_email_roles_valid'
      and conrelid = 'public.tenant_settings'::regclass
  ) then
    alter table public.tenant_settings
      add constraint tenant_settings_lead_email_roles_valid check (
        cardinality(lead_email_roles) between 0 and 4
        and lead_email_roles <@ array['owner', 'admin', 'editor', 'viewer']::text[]
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'tenant_settings_lead_email_mode_valid'
      and conrelid = 'public.tenant_settings'::regclass
  ) then
    alter table public.tenant_settings
      add constraint tenant_settings_lead_email_mode_valid check (
        lead_email_mode in ('instant', 'hourly')
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'tenant_settings_lead_email_unassigned_valid'
      and conrelid = 'public.tenant_settings'::regclass
  ) then
    alter table public.tenant_settings
      add constraint tenant_settings_lead_email_unassigned_valid check (
        lead_email_unassigned_address is null
        or (
          char_length(lead_email_unassigned_address) between 3 and 320
          and lead_email_unassigned_address = lower(btrim(lead_email_unassigned_address))
          and lead_email_unassigned_address ~ '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$'
        )
      );
  end if;
end;
$$;

create table if not exists public.lead_email_digest_batches (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  window_start timestamptz not null,
  lead_ids uuid[] not null,
  status text not null default 'pending'
    check (status in ('pending', 'delivering', 'retrying', 'sent', 'failed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  next_attempt_at timestamptz not null,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_email_digest_batches_tenant_window_unique unique (tenant_id, window_start),
  constraint lead_email_digest_batches_lead_count check (cardinality(lead_ids) between 1 and 100),
  constraint lead_email_digest_batches_last_error_bounded check (
    last_error is null or char_length(last_error) <= 500
  )
);

create index if not exists lead_email_digest_batches_due_idx
  on public.lead_email_digest_batches (next_attempt_at)
  where status in ('pending', 'retrying');
create index if not exists lead_email_digest_batches_stale_idx
  on public.lead_email_digest_batches (updated_at)
  where status = 'delivering';

alter table public.lead_email_digest_batches enable row level security;
-- Deliberately no client policy: lead contact data is resolved by trusted
-- service-role workers only.

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'lead_email_digest_batches_set_updated_at'
      and tgrelid = 'public.lead_email_digest_batches'::regclass
  ) then
    create trigger lead_email_digest_batches_set_updated_at
      before update on public.lead_email_digest_batches
      for each row execute function public.set_updated_at();
  end if;
end;
$$;

create or replace function public.enqueue_lead_email_digest(
  p_tenant_id uuid,
  p_lead_id uuid,
  p_created_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window_start timestamptz := date_trunc('hour', p_created_at);
  v_batch_id uuid;
begin
  if not exists (
    select 1 from public.leads
    where id = p_lead_id and tenant_id = p_tenant_id
  ) then
    return null;
  end if;

  loop
    insert into public.lead_email_digest_batches (
      tenant_id,
      window_start,
      lead_ids,
      next_attempt_at
    ) values (
      p_tenant_id,
      v_window_start,
      array[p_lead_id],
      v_window_start + interval '1 hour'
    )
    on conflict (tenant_id, window_start) do update set
      lead_ids = case
        when p_lead_id = any(public.lead_email_digest_batches.lead_ids)
          then public.lead_email_digest_batches.lead_ids
        else array_append(public.lead_email_digest_batches.lead_ids, p_lead_id)
      end
    where public.lead_email_digest_batches.status in ('pending', 'retrying')
      and cardinality(public.lead_email_digest_batches.lead_ids) < 100
    returning id into v_batch_id;

    if v_batch_id is not null then
      return v_batch_id;
    end if;
    v_window_start := v_window_start + interval '1 hour';
  end loop;
end;
$$;

create or replace function public.claim_lead_email_digests(p_limit integer default 25)
returns table (
  id uuid,
  tenant_id uuid,
  window_start timestamptz,
  lead_ids uuid[],
  attempt_count integer
)
language sql
security definer
set search_path = public, pg_temp
as $$
  with due as (
    select batch.id
    from public.lead_email_digest_batches batch
    where (
      (batch.status in ('pending', 'retrying') and batch.next_attempt_at <= now())
      or (batch.status = 'delivering' and batch.updated_at <= now() - interval '15 minutes')
    )
    order by batch.next_attempt_at, batch.id
    for update skip locked
    limit least(greatest(p_limit, 1), 100)
  ), claimed as (
    update public.lead_email_digest_batches batch
      set status = 'delivering',
          attempt_count = batch.attempt_count + 1,
          last_error = null
      from due
      where batch.id = due.id
      returning batch.id, batch.tenant_id, batch.window_start,
        batch.lead_ids, batch.attempt_count
  )
  select * from claimed;
$$;

revoke all on function public.enqueue_lead_email_digest(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.claim_lead_email_digests(integer)
  from public, anon, authenticated;
grant execute on function public.enqueue_lead_email_digest(uuid, uuid, timestamptz)
  to service_role;
grant execute on function public.claim_lead_email_digests(integer)
  to service_role;

comment on column public.tenant_settings.lead_email_enabled is
  'Default-off switch for new-lead transactional email notifications.';
comment on table public.lead_email_digest_batches is
  'Service-only durable hourly lead notification batches.';
