-- 052_email_delivery_events.sql
-- SCRUM-196. Idempotent Resend delivery events and service-only hard-bounce
-- suppressions. This migration does not provision DNS or contact Resend.

create table if not exists public.tenant_email_events (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null default 'resend' check (provider = 'resend'),
  provider_event_id text not null,
  provider_email_id text not null,
  event_type text not null
    check (event_type in ('email.delivered', 'email.bounced', 'email.complained')),
  recipients text[] not null,
  template_key text,
  bounce_type text,
  bounce_subtype text,
  bounce_message text,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint tenant_email_events_provider_event_unique unique (provider, provider_event_id),
  constraint tenant_email_events_provider_event_id_valid check (
    char_length(provider_event_id) between 1 and 200
    and provider_event_id not like '%' || chr(10) || '%'
    and provider_event_id not like '%' || chr(13) || '%'
  ),
  constraint tenant_email_events_provider_email_id_valid check (
    char_length(provider_email_id) between 1 and 200
    and provider_email_id not like '%' || chr(10) || '%'
    and provider_email_id not like '%' || chr(13) || '%'
  ),
  constraint tenant_email_events_recipient_count check (cardinality(recipients) between 1 and 50),
  constraint tenant_email_events_template_key_valid check (
    template_key is null or char_length(template_key) between 1 and 80
  ),
  constraint tenant_email_events_bounce_fields_bounded check (
    (bounce_type is null or char_length(bounce_type) <= 100)
    and (bounce_subtype is null or char_length(bounce_subtype) <= 100)
    and (bounce_message is null or char_length(bounce_message) <= 500)
  )
);

create table if not exists public.tenant_email_suppressions (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  recipient_email text not null,
  reason text not null check (reason = 'hard_bounce'),
  source_event_id uuid not null references public.tenant_email_events(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, recipient_email),
  constraint tenant_email_suppressions_recipient_valid check (
    char_length(recipient_email) between 3 and 320
    and recipient_email = lower(btrim(recipient_email))
    and recipient_email ~ '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$'
  )
);

create index if not exists tenant_email_events_tenant_occurred_idx
  on public.tenant_email_events (tenant_id, occurred_at desc);
create index if not exists tenant_email_events_provider_email_idx
  on public.tenant_email_events (provider_email_id, occurred_at desc);

alter table public.tenant_email_events enable row level security;
alter table public.tenant_email_suppressions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tenant_email_events'
      and policyname = 'tenant_email_events_select_member'
  ) then
    create policy "tenant_email_events_select_member" on public.tenant_email_events
      for select to authenticated
      using (tenant_id in (select public.tenant_ids_for_current_user()));
  end if;
end;
$$;

-- No policy is created for tenant_email_suppressions. Only service-role code
-- may check or mutate the private recipient suppression ledger.

create or replace function public.record_resend_email_event(
  p_tenant_id uuid,
  p_provider_event_id text,
  p_provider_email_id text,
  p_event_type text,
  p_recipients text[],
  p_template_key text,
  p_bounce_type text,
  p_bounce_subtype text,
  p_bounce_message text,
  p_occurred_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event_id uuid;
  v_recipient text;
begin
  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    return 'unknown_tenant';
  end if;

  insert into public.tenant_email_events (
    tenant_id,
    provider,
    provider_event_id,
    provider_email_id,
    event_type,
    recipients,
    template_key,
    bounce_type,
    bounce_subtype,
    bounce_message,
    occurred_at
  ) values (
    p_tenant_id,
    'resend',
    p_provider_event_id,
    p_provider_email_id,
    p_event_type,
    p_recipients,
    p_template_key,
    p_bounce_type,
    p_bounce_subtype,
    p_bounce_message,
    p_occurred_at
  )
  on conflict on constraint tenant_email_events_provider_event_unique do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return 'duplicate';
  end if;

  if p_event_type = 'email.bounced' and lower(coalesce(p_bounce_type, '')) = 'permanent' then
    foreach v_recipient in array p_recipients loop
      v_recipient := lower(btrim(v_recipient));
      insert into public.tenant_email_suppressions (
        tenant_id,
        recipient_email,
        reason,
        source_event_id
      ) values (
        p_tenant_id,
        v_recipient,
        'hard_bounce',
        v_event_id
      )
      on conflict (tenant_id, recipient_email) do update set
        source_event_id = excluded.source_event_id,
        updated_at = now();
    end loop;
  end if;

  return 'recorded';
end;
$$;

revoke all on function public.record_resend_email_event(
  uuid, text, text, text, text[], text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.record_resend_email_event(
  uuid, text, text, text, text[], text, text, text, text, timestamptz
) to service_role;

comment on table public.tenant_email_events is
  'Privacy-minimal, idempotent Resend delivered/bounced/complained event ledger.';
comment on table public.tenant_email_suppressions is
  'Hard-bounced recipient ledger. RLS deny-all; service-role access only.';
