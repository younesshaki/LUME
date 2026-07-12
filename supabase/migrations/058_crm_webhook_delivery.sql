-- 058_crm_webhook_delivery.sql
-- SCRUM-176. CRM endpoint metadata, bounded tenant retry schedules, atomic
-- encrypted credential creation, and a service-only delivery claim lease.

create or replace function public.valid_webhook_retry_seconds(value integer[])
returns boolean
language sql
immutable
strict
as $$
  select cardinality(value) between 1 and 10
    and not exists (
      select 1 from unnest(value) delay
      where delay < 1 or delay > 86400
    );
$$;

alter table public.tenant_webhooks
  add column if not exists integration_kind text not null default 'custom',
  add column if not exists retry_delays_seconds integer[] not null
    default array[60, 300, 1800, 3600, 21600]::integer[];

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tenant_webhooks_integration_kind_valid'
      and conrelid = 'public.tenant_webhooks'::regclass
  ) then
    alter table public.tenant_webhooks
      add constraint tenant_webhooks_integration_kind_valid check (
        integration_kind in ('hubspot', 'pipedrive', 'custom')
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'tenant_webhooks_retry_delays_valid'
      and conrelid = 'public.tenant_webhooks'::regclass
  ) then
    alter table public.tenant_webhooks
      add constraint tenant_webhooks_retry_delays_valid check (
        public.valid_webhook_retry_seconds(retry_delays_seconds)
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'tenant_webhooks_config_bounded'
      and conrelid = 'public.tenant_webhooks'::regclass
  ) then
    alter table public.tenant_webhooks
      add constraint tenant_webhooks_config_bounded check (
        char_length(btrim(name)) between 1 and 100
        and char_length(endpoint_url) <= 2048
      ) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'tenant_webhook_credentials_ciphertext_bounded'
      and conrelid = 'public.tenant_webhook_credentials'::regclass
  ) then
    alter table public.tenant_webhook_credentials
      add constraint tenant_webhook_credentials_ciphertext_bounded check (
        char_length(signing_secret_ciphertext) between 32 and 4096
      ) not valid;
  end if;
end;
$$;

create index if not exists webhook_deliveries_stale_idx
  on public.webhook_deliveries (updated_at)
  where status = 'delivering';

create or replace function public.create_tenant_crm_webhook(
  p_tenant_id uuid,
  p_name text,
  p_endpoint_url text,
  p_integration_kind text,
  p_retry_delays_seconds integer[],
  p_signing_secret_ciphertext text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into public.tenant_webhooks (
    tenant_id, name, endpoint_url, events, enabled, integration_kind,
    retry_delays_seconds
  ) values (
    p_tenant_id, p_name, p_endpoint_url, array['lead.created']::text[], true,
    p_integration_kind, p_retry_delays_seconds
  ) returning id into v_id;

  insert into public.tenant_webhook_credentials (
    webhook_id, tenant_id, signing_secret_ciphertext
  ) values (v_id, p_tenant_id, p_signing_secret_ciphertext);
  return v_id;
end;
$$;

create or replace function public.claim_webhook_deliveries(p_limit integer default 50)
returns table (
  id uuid,
  tenant_id uuid,
  webhook_id uuid,
  endpoint_url text,
  event_type text,
  event_id text,
  payload jsonb,
  attempt_count integer,
  signing_secret_ciphertext text,
  retry_delays_seconds integer[]
)
language sql
security definer
set search_path = public, pg_temp
as $$
  with due as (
    select delivery.id
    from public.webhook_deliveries delivery
    join public.tenant_webhooks webhook on webhook.id = delivery.webhook_id
    where webhook.enabled = true
      and (
        (delivery.status in ('pending', 'retrying') and delivery.next_attempt_at <= now())
        or (delivery.status = 'delivering' and delivery.updated_at <= now() - interval '15 minutes')
      )
    order by delivery.next_attempt_at, delivery.id
    for update of delivery skip locked
    limit least(greatest(p_limit, 1), 100)
  ), claimed as (
    update public.webhook_deliveries delivery
      set status = 'delivering',
          attempt_count = delivery.attempt_count + 1,
          last_error = null
      from due
      where delivery.id = due.id
      returning delivery.*
  )
  select claimed.id, claimed.tenant_id, claimed.webhook_id,
    webhook.endpoint_url, claimed.event_type, claimed.event_id, claimed.payload,
    claimed.attempt_count, credential.signing_secret_ciphertext,
    webhook.retry_delays_seconds
  from claimed
  join public.tenant_webhooks webhook on webhook.id = claimed.webhook_id
  join public.tenant_webhook_credentials credential on credential.webhook_id = claimed.webhook_id;
$$;

revoke all on function public.create_tenant_crm_webhook(
  uuid, text, text, text, integer[], text
) from public, anon, authenticated;
revoke all on function public.claim_webhook_deliveries(integer)
  from public, anon, authenticated;
grant execute on function public.create_tenant_crm_webhook(
  uuid, text, text, text, integer[], text
) to service_role;
grant execute on function public.claim_webhook_deliveries(integer) to service_role;

comment on function public.create_tenant_crm_webhook is
  'Service-only atomic endpoint and encrypted signing credential creation.';
