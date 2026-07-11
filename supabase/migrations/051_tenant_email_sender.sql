-- 051_tenant_email_sender.sql
-- SCRUM-194. Optional trusted sender override. Domain verification and DKIM
-- provisioning remain SCRUM-196; null uses the server-wide LUME fallback.

alter table public.tenant_settings
  add column if not exists email_from_address text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tenant_settings_email_from_address_valid'
      and conrelid = 'public.tenant_settings'::regclass
  ) then
    alter table public.tenant_settings
      add constraint tenant_settings_email_from_address_valid check (
        email_from_address is null
        or (
          char_length(email_from_address) between 3 and 320
          and email_from_address = btrim(email_from_address)
          and email_from_address not like '%' || chr(10) || '%'
          and email_from_address not like '%' || chr(13) || '%'
          and email_from_address ~ '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$'
        )
      );
  end if;
end;
$$;

comment on column public.tenant_settings.email_from_address is
  'Optional verified tenant sender address; null falls back to RESEND_FROM_EMAIL/no-reply@lume.app.';
