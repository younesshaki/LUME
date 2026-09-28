-- Website Hub onboarding is per authenticated member and tenant. These fields
-- extend the existing RLS-protected preference row; they do not change
-- membership, roles, or any tenant website data.
alter table public.tenant_member_preferences
  add column if not exists website_tour_version integer,
  add column if not exists website_tour_completed_at timestamptz,
  add column if not exists website_tour_skipped_at timestamptz;

comment on column public.tenant_member_preferences.website_tour_version is
  'Version of the Website Hub onboarding tour last completed or skipped by this member.';
comment on column public.tenant_member_preferences.website_tour_completed_at is
  'When this member completed the stored Website Hub onboarding tour version.';
comment on column public.tenant_member_preferences.website_tour_skipped_at is
  'When this member skipped or closed the stored Website Hub onboarding tour version.';
