-- 031_tenant_bot_config.sql
-- SCRUM-156. One tenant-scoped configuration record for bot runtime policy.

create table if not exists public.tenant_bot_config (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  persona jsonb not null default '{}'::jsonb,
  allowed_tools text[] not null default '{}'::text[],
  model text not null default 'deepseek-chat',
  temperature numeric(3, 2) not null default 0.40
    check (temperature >= 0 and temperature <= 2),
  max_iterations integer not null default 3
    check (max_iterations >= 1 and max_iterations <= 10),
  system_prompt_override text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tenant_bot_config enable row level security;

create policy "tenant_bot_config_select_member" on public.tenant_bot_config
  for select to authenticated
  using (tenant_id in (select public.tenant_ids_for_current_user()));

create policy "tenant_bot_config_write_editor" on public.tenant_bot_config
  for all to authenticated
  using (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']))
  with check (public.user_has_tenant_role(tenant_id, array['owner', 'admin', 'editor']));

create trigger tenant_bot_config_set_updated_at
  before update on public.tenant_bot_config
  for each row execute function public.set_updated_at();

comment on table public.tenant_bot_config is
  'Per-tenant bot persona, model, iteration limit, and callable-tool allowlist.';
comment on column public.tenant_bot_config.allowed_tools is
  'Empty means no tools are allowed; runtime code must never interpret it as unrestricted.';
