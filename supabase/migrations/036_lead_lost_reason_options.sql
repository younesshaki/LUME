-- 036_lead_lost_reason_options.sql
-- SCRUM-177. Tenant-editable lost-reason taxonomy. The six defaults live in
-- application code because this sweep may not mutate/seed tenant data.

create table if not exists public.lead_lost_reason_options (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key text not null check (
    char_length(key) between 1 and 64
    and key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  label text not null check (char_length(btrim(label)) between 1 and 120),
  sort_order integer not null default 0 check (sort_order between 0 and 1000000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_lost_reason_options_tenant_key_unique unique (tenant_id, key)
);

create index if not exists lead_lost_reason_options_tenant_order_idx
  on public.lead_lost_reason_options (tenant_id, sort_order, key);

alter table public.lead_lost_reason_options enable row level security;

create policy "lead_lost_reason_options_select_member"
  on public.lead_lost_reason_options
  for select to authenticated
  using (tenant_id in (select public.tenant_ids_for_current_user()));

create policy "lead_lost_reason_options_write_editor"
  on public.lead_lost_reason_options
  for all to authenticated
  using (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']))
  with check (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']));

create trigger lead_lost_reason_options_set_updated_at
  before update on public.lead_lost_reason_options
  for each row execute function public.set_updated_at();

-- Enforce future transitions without making unrelated edits to legacy lost
-- rows fail. Clearing a reason that was previously present is also rejected.
create function public.enforce_lead_lost_reason()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  reason_changed boolean;
  reason_allowed boolean;
begin
  if new.status <> 'lost' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    reason_changed := true;
  else
    reason_changed := old.status is distinct from 'lost'
      or old.lost_reason is distinct from new.lost_reason;
  end if;

  -- Leave unrelated edits to pre-existing legacy rows untouched.
  if not reason_changed then
    return new;
  end if;

  if nullif(btrim(new.lost_reason), '') is null then
    raise exception 'A lost reason is required when marking a lead lost.'
      using errcode = '23514';
  end if;

  select
    exists (
      select 1
      from public.lead_lost_reason_options reason_option
      where reason_option.tenant_id = new.tenant_id
        and reason_option.key = new.lost_reason
        and reason_option.is_active
    )
    or (
      new.lost_reason = any (
        array['price', 'timing', 'ghosted', 'competitor', 'wrong-fit', 'duplicate']::text[]
      )
      and not exists (
        select 1
        from public.lead_lost_reason_options reason_option
        where reason_option.tenant_id = new.tenant_id
          and reason_option.key = new.lost_reason
          and not reason_option.is_active
      )
    )
  into reason_allowed;

  if not reason_allowed then
    raise exception 'The selected lost reason is not active for this tenant.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger leads_enforce_lost_reason
  before insert or update on public.leads
  for each row execute function public.enforce_lead_lost_reason();

comment on table public.lead_lost_reason_options is
  'Tenant overrides and custom lost reasons; omitted defaults are supplied by application code.';
