# Admin dashboard analytics (PostHog)

Dashboard sessions of the demo dealership accounts (`demo-sean`, `demo-arash`,
`demo-max`) are recorded in the same PostHog project as the public site.
Nothing loads for anyone else, and LUME platform admins are never tracked.

## Finding a person

- **Distinct id** = the member's Supabase auth user id (a UUID that never
  changes). PostHog → Persons → search the id, or open the person from any
  recording.
- **Person properties** (set on identify): `lume_account` (e.g. `demo-sean`),
  `lume_dealership`, `lume_role`, `lume_tenants`, `email`, and
  `first_dashboard_visit_at` (set once: when they first opened the dashboard).
- **Recordings**: Session replay → filter *Person property* `lume_account =
  demo-sean` (or by the distinct id). Every dashboard event also carries the
  super properties `lume_surface = admin`, `lume_account`, `lume_tenant_slug`
  and `lume_release` (deployed commit).

## Events

| Event | When | Key properties |
|---|---|---|
| `$pageview` / `$pageleave` | every dashboard route (client navigation included) | `$current_url` |
| `$autocapture` | clicks, form submissions | element text/selector |
| `admin_session_started` | first page of a browser session | `account`, `landing_path` |
| `admin_section_viewed` | every route | `tenant_slug`, `section` (ids collapsed, e.g. `pages/:id`), `path` |
| `admin_tutorial_clicked` | Tutorial / Take Website tour button | `from_path`, `label` |
| `admin_tour_started` | Website tour opens | `trigger`: `automatic` \| `replay_link` \| `tutorial_button` |
| `admin_tour_step_viewed` | each tour step | `step_number`, `step_id`, `total_steps` |
| `admin_tour_completed` / `admin_tour_skipped` | Finish / Skip | `step_number`, `step_id` (skip) |
| `admin_tour_dismissed` | "Don't show again" | — |
| `admin_section_tour_started` | a section tutorial (Pages, Templates, Design, Navigation…) opens | `tour_key`, `trigger`: `automatic` \| `tutorial_button` |
| `admin_section_tour_step_viewed` / `_completed` / `_skipped` / `_dismissed` | section tutorial progress | `tour_key`, `step_number`, `total_steps` |
| `admin_block_added` | page editor: block added | `page_slug`, `block_type` |
| `admin_page_draft_saved` / `admin_page_published` | page editor | `page_slug`, `block_count` |

## Implementation

- Gate and identity: `apps/admin/lib/adminAnalytics.ts` (`adminAnalyticsIdentity`,
  `ADMIN_ANALYTICS_TENANT_SLUGS`).
- Tracker: `apps/admin/components/analytics/AdminAnalytics.tsx`, mounted by
  `apps/admin/app/admin/layout.tsx`; `captureAdminEvent()` for named events.
- Browser token: the admin's `POSTHOG_PROJECT_TOKEN` (or
  `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`) — only a publishable `phc_` project
  token is ever sent to the browser.
- Replay records inputs unmasked (same internal-phase setting as the public
  site); PostHog always masks password fields.
- If a different person signs in on the same browser, the tracker resets the
  PostHog identity so two accounts never merge.
