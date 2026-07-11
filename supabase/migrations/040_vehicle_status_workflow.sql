-- 040_vehicle_status_workflow.sql
-- SCRUM-211. Draft/live/sold/archived lifecycle, immutable sale facts, and a
-- service-only batch function for the 90-day sold-vehicle archival job.

alter table public.vehicles
  add column if not exists status text not null default 'live',
  add column if not exists sold_at timestamptz,
  add column if not exists sold_price integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'vehicles_status_valid'
      and conrelid = 'public.vehicles'::regclass
  ) then
    alter table public.vehicles
      add constraint vehicles_status_valid
      check (status in ('draft', 'live', 'sold', 'archived'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'vehicles_sold_price_nonnegative'
      and conrelid = 'public.vehicles'::regclass
  ) then
    alter table public.vehicles
      add constraint vehicles_sold_price_nonnegative
      check (sold_price is null or sold_price >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'vehicles_sale_facts_consistent'
      and conrelid = 'public.vehicles'::regclass
  ) then
    alter table public.vehicles
      add constraint vehicles_sale_facts_consistent
      check (
        (sold_at is null and sold_price is null)
        or (sold_at is not null and sold_price is not null)
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'vehicles_sold_status_has_facts'
      and conrelid = 'public.vehicles'::regclass
  ) then
    alter table public.vehicles
      add constraint vehicles_sold_status_has_facts
      check (status <> 'sold' or (sold_at is not null and sold_price is not null));
  end if;
end;
$$;

create index if not exists vehicles_tenant_status_updated_idx
  on public.vehicles (tenant_id, status, updated_at desc);
create index if not exists vehicles_sold_archive_due_idx
  on public.vehicles (sold_at, id)
  where status = 'sold';

create or replace function public.apply_vehicle_status_workflow()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'sold' then
      new.sold_at := statement_timestamp();
      new.sold_price := new.price;
    else
      new.sold_at := null;
      new.sold_price := null;
    end if;
    return new;
  end if;

  if old.status = 'sold' and new.status not in ('sold', 'archived') then
    raise exception 'Sold vehicles can only remain sold or be archived';
  end if;
  if old.status = 'archived' and old.sold_at is not null and new.status <> 'archived' then
    raise exception 'Archived sold vehicles cannot be reopened';
  end if;

  if old.sold_at is not null then
    if new.price is distinct from old.price then
      raise exception 'Price is frozen after a vehicle is sold';
    end if;
    new.sold_at := old.sold_at;
    new.sold_price := old.sold_price;
    new.price := old.price;
  elsif new.status = 'sold' then
    new.sold_at := statement_timestamp();
    new.sold_price := new.price;
  else
    -- Sale metadata is database-owned and cannot be forged on unsold rows.
    new.sold_at := null;
    new.sold_price := null;
  end if;

  return new;
end;
$$;

create trigger vehicles_apply_status_workflow
  before insert or update of status, price, sold_at, sold_price on public.vehicles
  for each row execute function public.apply_vehicle_status_workflow();

create or replace function public.protect_sold_vehicle_history()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.sold_at is not null then
    raise exception 'Sold vehicle history cannot be deleted';
  end if;
  return old;
end;
$$;

create trigger vehicles_protect_sold_history
  before delete on public.vehicles
  for each row execute function public.protect_sold_vehicle_history();

-- Existing public access remains tenant-active scoped. This restrictive anon
-- policy is ANDed with it, so authenticated tenant members still see every
-- status while public clients can only read live inventory.
create policy "vehicles_select_public_live" on public.vehicles
  as restrictive for select to anon
  using (status = 'live');

create or replace function public.archive_due_sold_vehicles(
  p_cutoff timestamptz,
  p_limit integer default 500
)
returns table (vehicle_id uuid)
language sql
security definer
set search_path = public
as $$
  with due as (
    select v.id
    from public.vehicles v
    where v.status = 'sold'
      and v.sold_at <= p_cutoff
    order by v.sold_at, v.id
    limit greatest(1, least(coalesce(p_limit, 500), 5000))
    for update skip locked
  )
  update public.vehicles v
  set status = 'archived'
  from due
  where v.id = due.id
  returning v.id as vehicle_id;
$$;

revoke all on function public.archive_due_sold_vehicles(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.archive_due_sold_vehicles(timestamptz, integer)
  to service_role;

comment on column public.vehicles.status is
  'Inventory lifecycle; only live rows are publicly readable.';
comment on function public.archive_due_sold_vehicles(timestamptz, integer) is
  'Service-only, bounded transition of sold vehicles older than a supplied cutoff.';
