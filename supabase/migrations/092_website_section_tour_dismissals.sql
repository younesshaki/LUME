-- Route-local Website tutorials reopen for the demo cohort until that member
-- explicitly dismisses that exact tutorial. Keeping the keyed timestamps in
-- the existing tenant/member preference row preserves its proven RLS model and
-- prevents a dismissal on Pages from hiding Templates, Design, or Navigation.
alter table public.tenant_member_preferences
  add column if not exists website_section_tour_dismissals jsonb not null default '{}'::jsonb;

alter table public.tenant_member_preferences
  add constraint tenant_member_preferences_website_section_tour_dismissals_object
  check (jsonb_typeof(website_section_tour_dismissals) = 'object');

comment on column public.tenant_member_preferences.website_section_tour_dismissals is
  'Per-route Website tutorial opt-outs keyed by stable tour name; values are ISO timestamps.';
