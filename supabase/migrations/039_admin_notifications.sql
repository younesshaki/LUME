-- 039_admin_notifications.sql
-- SCRUM-204. Tenant/user-scoped admin notifications plus resilient producers
-- for new leads and terminal CSV imports.

create table if not exists public.admin_notifications (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  type text not null check (
    type in ('lead.created', 'domain.verified', 'storage.quota_warning', 'csv_import.completed')
  ),
  body text not null check (char_length(btrim(body)) between 1 and 500),
  link text check (link is null or (char_length(link) <= 2048 and link like '/admin/%')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists admin_notifications_tenant_created_idx
  on public.admin_notifications (tenant_id, created_at desc);
create index if not exists admin_notifications_tenant_unread_idx
  on public.admin_notifications (tenant_id, created_at desc)
  where read_at is null;
create index if not exists admin_notifications_user_idx
  on public.admin_notifications (user_id, created_at desc)
  where user_id is not null;

alter table public.admin_notifications enable row level security;

create policy "admin_notifications_select_recipient" on public.admin_notifications
  for select to authenticated
  using (
    tenant_id in (select public.tenant_ids_for_current_user())
    and (user_id is null or user_id = auth.uid())
  );

-- No client write policies: trusted producers create rows and server actions
-- only update read_at after re-checking the caller through RLS.

create function public.notify_admins_on_new_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tenant_slug text;
begin
  begin
    select slug into tenant_slug from public.tenants where id = new.tenant_id;
    insert into public.admin_notifications (tenant_id, type, body, link)
    values (
      new.tenant_id,
      'lead.created',
      'New lead captured from ' || replace(new.source, '-', ' ') || '.',
      '/admin/' || tenant_slug || '/leads/' || new.id::text
    );
  exception when others then
    raise warning 'Unable to create lead notification: %', sqlerrm;
  end;
  return new;
end;
$$;

create trigger leads_create_admin_notification
  after insert on public.leads
  for each row execute function public.notify_admins_on_new_lead();

create function public.notify_admins_on_csv_import_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tenant_slug text;
begin
  if old.status in ('pending', 'running')
    and new.status in ('succeeded', 'failed', 'partial')
  then
    begin
      select slug into tenant_slug from public.tenants where id = new.tenant_id;
      insert into public.admin_notifications (tenant_id, type, body, link)
      values (
        new.tenant_id,
        'csv_import.completed',
        'CSV import ' || left(new.source_file_name, 200) || ' finished with status ' || new.status || '.',
        '/admin/' || tenant_slug || '/vehicles/import'
      );
    exception when others then
      raise warning 'Unable to create CSV import notification: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;

create trigger csv_imports_create_admin_notification
  after update of status on public.csv_imports
  for each row execute function public.notify_admins_on_csv_import_completion();

comment on table public.admin_notifications is
  'Recent tenant admin events; null user_id addresses every tenant member.';
