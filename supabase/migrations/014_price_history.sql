-- 014_price_history.sql
-- Epic I support — SCRUM-148. Logs every vehicle price change so the bot's
-- "find best deal" / price-drop features (SCRUM-147) have real data.
--
-- SAFETY: the logging trigger is written so it can NEVER block or roll back a
-- vehicle update. The trigger function wraps its INSERT in an exception handler
-- that swallows any error — at worst we lose a history row, we never break the
-- admin's ability to edit a vehicle.

create table if not exists public.price_history (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  old_price integer,
  new_price integer not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists price_history_vehicle_idx
  on public.price_history (vehicle_id, changed_at desc);
create index if not exists price_history_tenant_idx
  on public.price_history (tenant_id, changed_at desc);

-- ─── RLS: read for members, no client writes (only the trigger writes) ───────
alter table public.price_history enable row level security;

drop policy if exists "price_history_select_member" on public.price_history;
create policy "price_history_select_member" on public.price_history
  for select
  using (tenant_id in (select public.tenant_ids_for_current_user()));

-- ─── Logging trigger ─────────────────────────────────────────────────────────
create or replace function public.log_vehicle_price_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.price is distinct from old.price then
    begin
      insert into public.price_history (tenant_id, vehicle_id, old_price, new_price, changed_by)
      values (new.tenant_id, new.id, old.price, new.price, auth.uid());
    exception when others then
      -- Never let history logging break a vehicle update.
      raise warning 'price_history insert failed for vehicle %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists vehicles_log_price_change on public.vehicles;
create trigger vehicles_log_price_change
  after update of price on public.vehicles
  for each row execute function public.log_vehicle_price_change();

-- Trigger functions must not be callable via the REST RPC surface.
revoke execute on function public.log_vehicle_price_change() from anon, authenticated, public;
