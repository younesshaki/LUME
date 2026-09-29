-- The demo Website Hub tour opens every time the Website section is opened,
-- until the member chooses "Don't show again". Finishing or skipping a run no
-- longer stops it; this records that explicit opt-out per member and tenant.
alter table public.tenant_member_preferences
  add column if not exists website_tour_dismissed_at timestamptz;

comment on column public.tenant_member_preferences.website_tour_dismissed_at is
  'When this member chose "Don''t show again" for the automatic Website Hub tour.';
