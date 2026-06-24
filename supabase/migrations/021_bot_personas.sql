-- 021_bot_personas.sql
-- Tenant-scoped bot persona configuration for admin-managed AI behavior.

create table if not exists public.bot_personas (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null default 'LUME Concierge',
  tone text not null default 'cinematic'
    check (tone in ('cinematic', 'concise', 'warm', 'formal', 'technical')),
  system_prompt text not null default '',
  capabilities jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bot_personas_name_not_empty check (length(btrim(name)) > 0)
);

create index if not exists bot_personas_tenant_idx
  on public.bot_personas (tenant_id);
create unique index if not exists bot_personas_one_active_per_tenant_idx
  on public.bot_personas (tenant_id)
  where is_active;

alter table public.bot_personas enable row level security;

drop policy if exists "bot_personas_select_member" on public.bot_personas;
create policy "bot_personas_select_member" on public.bot_personas
  for select
  using (tenant_id in (select public.tenant_ids_for_current_user()));

drop policy if exists "bot_personas_write_editor" on public.bot_personas;
create policy "bot_personas_write_editor" on public.bot_personas
  for all
  using (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']))
  with check (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']));

drop trigger if exists bot_personas_set_updated_at on public.bot_personas;
create trigger bot_personas_set_updated_at
  before update on public.bot_personas
  for each row execute function public.set_updated_at();
