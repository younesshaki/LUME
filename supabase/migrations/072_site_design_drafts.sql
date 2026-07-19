-- Durable working drafts for the built-in website template collection.
--
-- A tenant has at most one working draft per template. Published state remains
-- in tenants.theme and rollback snapshots remain in site_design_revisions.
-- Drafts are written only by trusted Admin server operations after owner/admin
-- authorization and full SiteDesign + asset-ownership validation.

create table if not exists public.site_design_drafts (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  template_key text not null
    check (char_length(template_key) between 1 and 64),
  design jsonb not null check (jsonb_typeof(design) = 'object'),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_design_drafts_tenant_template_unique
    unique (tenant_id, template_key)
);

create index if not exists site_design_drafts_tenant_updated_idx
  on public.site_design_drafts (tenant_id, updated_at desc);

alter table public.site_design_drafts enable row level security;

drop policy if exists "site_design_drafts_select_member"
  on public.site_design_drafts;
create policy "site_design_drafts_select_member"
  on public.site_design_drafts
  for select
  to authenticated
  using (tenant_id in (select public.tenant_ids_for_current_user()));

-- No browser INSERT/UPDATE/DELETE policy. The service-role Admin operation is
-- the only writer, so a browser cannot bypass validation or cross tenants.

drop trigger if exists site_design_drafts_set_updated_at
  on public.site_design_drafts;
create trigger site_design_drafts_set_updated_at
  before update on public.site_design_drafts
  for each row execute function public.set_updated_at();

comment on table public.site_design_drafts is
  'One trusted-server-managed working website design per tenant and built-in template.';
