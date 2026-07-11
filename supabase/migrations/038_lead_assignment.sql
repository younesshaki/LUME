-- 038_lead_assignment.sql
-- SCRUM-173. Manual lead assignment plus persistent, concurrency-safe
-- round-robin routing. Sales participation is orthogonal to RBAC roles.

alter table public.tenant_members
  add column if not exists sales_enabled boolean not null default false,
  add column if not exists out_of_office boolean not null default false;

create table if not exists public.tenant_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  lead_assignment_mode text not null default 'manual'
    check (lead_assignment_mode in ('manual', 'round_robin')),
  last_lead_assignee_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tenant_settings enable row level security;

create policy "tenant_settings_select_member" on public.tenant_settings
  for select to authenticated
  using (tenant_id in (select public.tenant_ids_for_current_user()));

create policy "tenant_settings_write_admin" on public.tenant_settings
  for all to authenticated
  using (public.user_has_tenant_role(tenant_id, array['owner', 'admin']))
  with check (public.user_has_tenant_role(tenant_id, array['owner', 'admin']));

create trigger tenant_settings_set_updated_at
  before update on public.tenant_settings
  for each row execute function public.set_updated_at();

create index if not exists tenant_members_sales_availability_idx
  on public.tenant_members (tenant_id, created_at, user_id)
  where sales_enabled and not out_of_office;

create function public.enforce_lead_assignee_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_to is not null and not exists (
    select 1
    from public.tenant_members member
    where member.tenant_id = new.tenant_id
      and member.user_id = new.assigned_to
  ) then
    raise exception 'Lead assignee must be a member of the tenant.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger leads_enforce_assignee_membership
  before insert or update of assigned_to, tenant_id on public.leads
  for each row execute function public.enforce_lead_assignee_membership();

create function public.assign_lead_round_robin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  settings_row public.tenant_settings%rowtype;
  eligible_user_ids uuid[];
  last_position integer;
  next_position integer;
begin
  if new.assigned_to is not null then
    return new;
  end if;

  select *
    into settings_row
    from public.tenant_settings
    where tenant_id = new.tenant_id
    for update;

  if not found or settings_row.lead_assignment_mode <> 'round_robin' then
    return new;
  end if;

  select array_agg(member.user_id order by member.created_at, member.user_id)
    into eligible_user_ids
    from public.tenant_members member
    where member.tenant_id = new.tenant_id
      and member.sales_enabled
      and not member.out_of_office;

  if eligible_user_ids is null or cardinality(eligible_user_ids) = 0 then
    return new;
  end if;

  last_position := array_position(eligible_user_ids, settings_row.last_lead_assignee_id);
  next_position := case
    when last_position is null then 1
    else (last_position % cardinality(eligible_user_ids)) + 1
  end;

  new.assigned_to := eligible_user_ids[next_position];
  update public.tenant_settings
    set last_lead_assignee_id = new.assigned_to
    where tenant_id = new.tenant_id;

  return new;
end;
$$;

create trigger leads_round_robin_assignment
  before insert on public.leads
  for each row execute function public.assign_lead_round_robin();

comment on column public.tenant_members.sales_enabled is
  'Whether this member participates in automatic sales lead routing.';
comment on column public.tenant_members.out_of_office is
  'Temporarily excludes this member from round-robin lead routing.';
comment on table public.tenant_settings is
  'Tenant-wide operational settings and persistent round-robin cursor.';
