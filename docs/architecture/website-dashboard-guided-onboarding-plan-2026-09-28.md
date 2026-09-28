# Website dashboard guided onboarding — v1 plan

## Status

Implemented locally on 2026-09-28 and awaiting review. The additive migration
exists in the repository but has not been applied to any Supabase environment;
no production data has been changed or deployed. The visual layer uses
`nextstepjs` 2.3.0, is lazy-loaded only by the admin Website Hub, and has unit
and real-overlay integration coverage.

### Update (2026-09-28): last step points at the sidebar's View website

The final step now highlights the admin sidebar's **View website** link
(`data-tour="website-view-site"`, card to its right). The sidebar is
off-canvas on phones, so steps may list `fallbackSelectors`: the tour picks the
first visible target at start (`visibleTourSelector`) and puts the card below
a fallback. This step falls back to the full-width Hub header, which holds the
Open live site button. The tour never waits for optional targets
(`WEBSITE_TOUR_OPTIONAL_TARGETS`) before starting.

### Update (2026-09-28): cards always stay on screen

The Launch readiness step was removed: its section is taller than a laptop
screen, and because the card sits above or below its target, `nextstepjs`
scrolled the card out of view. The "published site" step now targets the real
preview section (it pointed at the Loading-animation switch). Every step is
fitted to the screen when the tour starts (`compactTourSelector`): a target
taller than the viewport minus `WEBSITE_TOUR_CARD_CLEARANCE` is swapped for a
`[data-tour-anchor]` inside it, else its first heading. New steps on large
sections should mark their header with `data-tour-anchor`.

### Update (2026-09-28): on-demand Tutorial button

Per the owner, the tour can be started whenever wanted: a **Tutorial** button
in the admin top bar (every tenant page) opens the Website Hub with the tour,
or restarts it in place when already on the Hub (`WEBSITE_TOUR_START_EVENT`).
Manual start now works for every tenant; the automatic first-visit start
remains limited to the demo cohort below. The migration shipped as
`090_website_tour_preferences.sql` (089 was taken on main).

## Decision

Build a focused, polished **Website Hub tour** for the first rollout—not a
fragile cross-route mega-tour.

The first cohort is the current demo-account users for:

- Sean Auto Group (`demo-sean`)
- Arash Motors (`demo-arash`)
- Max Auto (`demo-max`)

The tour teaches the existing Website workspace. It must not alter any website
configuration, pages, templates, branding, navigation, domains, or published
content. It is intentionally deferred until after the upcoming demo/meeting;
it should not be rushed into a production release the night before one.

## Actual LUME architecture

LUME has two separate front ends:

- Public dealership sites at the repository root: Vite + React.
- Admin dashboard, including Website management: **Next.js App Router + React
  19**, in `apps/admin/`.

The tour belongs only in `apps/admin`. It must not be added to the Vite public
application or public dealership websites.

Before implementation, verify the official API and compatibility requirements
of `nextstepjs` for the installed Next.js and React versions. As of the latest
repo review, `nextstepjs` is not installed; `motion` is already available in
the admin app. Do not assume package exports or callbacks from old examples.

## What v1 includes

### Website Hub tour

The tour starts only on `/admin/[tenant]/website`, after its data has loaded.
It has seven concise steps, each targeting a control that
exists on the Website hub today:

1. **Your dealership website** — orient the user to the Website workspace.
2. **Choose a template** — target the Templates card and explain: “Preview and
   prepare a versioned visual starting point without changing the live site.”
   The tour never changes a template automatically.
3. **Manage pages** — target Pages & content and explain that members can add,
   edit, and publish pages and arrange their blocks. It does not open an editor
   or create a page.
4. **Design, identity, and media** — target the relevant visual-management card
   group. Explain that Website design manages shared dark/light visual settings
   and is published explicitly; Logo & favicons manages dealership identity
   assets; Media assets manages images used across pages and blocks. This step
   deliberately includes the sixth Media assets card rather than pretending it
   does not exist.
5. **Header & navigation** — target that card and explain only what the Hub
   proves: members choose which pages appear in the header and how the top bar
   behaves. Do not claim it controls footer columns, menus, or CTAs unless the
   Navigation route is separately verified before a future route-local tour.
6. **Launch readiness** — target the Hub’s readiness section. Explain that it
   shows what remains before the site can go live; it does not publish.
7. **View the published site** — target Published website preview and finish
   there. Explain that draft template and design changes appear in this preview
   only after publishing, and that publishing itself happens elsewhere in the
   Website workflow. End with where to replay the tour.

Tooltip copy must be concise, professional, specific, and grounded in current
UI behavior. Do not claim autosave, drag-and-drop, content preservation,
responsive preview, or publication semantics until the code confirms them.

### Replay

Add a restrained **Take Website tour** / **Replay Website tour** action on the
Website hub. Also add a link to it from the existing Admin launch checklist
instead of creating a competing second onboarding system.

Replay starts the v1 tour on demand, whether the user previously completed or
skipped it. It must not erase historical completion data.

### Persistence

The source of truth must be server-side and scoped by **tenant + authenticated
member**, so one user’s completion cannot hide the tour for another user or
another tenant.

`tenant_member_preferences` is the established fit: it already has the right
composite key and RLS model, although it currently only stores
`sidebar_single_expand`.

Subject to explicit approval when implementation begins, add one additive
migration with the minimum needed fields:

```text
website_tour_version integer nullable
website_tour_completed_at timestamptz nullable
website_tour_skipped_at timestamptz nullable
```

This is deliberately simpler than a full state machine. V1 has no automatic
resume across routes, so `in_progress` and `last_step` do not add enough value
to justify their complexity.

Rules:

- no record/current version missing → eligible for automatic first launch;
- current version + `completed_at` → no automatic launch;
- current version + `skipped_at` → no automatic launch;
- manual replay always works for an eligible user;
- a future v2 gets a new version number and an explicit rollout decision.

V1 writes no state while a user is partway through the tour. If the dashboard
is reloaded before Finish or Skip, the next eligible Hub visit starts from step
one. This is intentional: the tour stays route-local and has no unsafe
cross-route resume behavior.

Local/session storage may be used only for temporary in-page UI coordination;
it is not the source of truth.

## Eligibility

Eligibility and completion are separate concerns.

For this small demo rollout, a single **server-owned allowlist of the three
demo tenant slugs** is acceptable, provided the product decision is that each
tenant’s current demo user is the intended audience. Slugs are stable internal
tenant identifiers and are not displayed in the UI.

If the requirement changes to “only these exact people even if other members
join their tenant,” replace the tenant allowlist with a per-member rollout flag
or authenticated user-ID allowlist. Do not use display names in client code.

Keep eligibility in one server-side function. Do not scatter IDs, names, or
tenant checks across UI components. Never show raw user identifiers in UI,
logs, documentation, analytics, or final reports.

## Why v1 does not navigate between routes

The Website system spans distinct routes:

- `/admin/[tenant]/website`
- `/admin/[tenant]/templates`
- `/admin/[tenant]/pages`
- `/admin/[tenant]/pages/[pageId]`
- `/admin/[tenant]/design`
- `/admin/[tenant]/branding`
- `/admin/[tenant]/navigation`
- `/admin/[tenant]/domains`

The page editor currently has manual draft saving but no reliable dirty/unsaved
state contract. A tour that automatically navigates users across those routes
could discard work, trigger unexpected dialogs, or point at unavailable DOM.

Therefore v1:

- does not automatically navigate routes;
- does not open unrelated route-level settings;
- does not include a page-editor tour;
- does not attempt resuming at a cross-route step;
- uses the hub to teach where each feature lives;
- lets users intentionally visit the destination from normal links.

## Deferred follow-ups

These are valuable, but explicitly out of v1:

1. **Page editor tour** — only after the editor has a tested unsaved-change
   contract that safely blocks or confirms navigation.
2. **Branding, Navigation, and Domain mini-tours** — short route-local tours
   launched only from their own pages.
3. **Cross-route continuation/resume** — only after route and dirty-state
   behavior are robust.
4. **Step-level analytics** — the admin currently lacks an approved browser
   analytics path. Do not add a second analytics client solely for this tour.
5. **General customer rollout** — enable only after results from the three
   demo users are reviewed.

## Safe tour behavior

Permitted actions:

- spotlight and scroll to a visible Website Hub control;
- focus a control;
- open/close a non-persistent hub-local disclosure only if its existing UI
  exposes a clean, safe action;
- let the user choose a normal navigation link themselves.

Forbidden actions:

- changing templates, branding, navigation, domains, or content;
- creating, deleting, archiving, or reordering pages/blocks;
- saving, publishing, or unpublishing;
- uploading/deleting media;
- submitting leads, connecting external services, or changing billing.

### Immediate-change controls are excluded

The Hub’s **Loading animation** switch is not a tour target. It persists to
the live site immediately and explicitly does not require publishing. The
NextStep overlay must be modal for pointer input: while a step is open, clicks
must not pass through the dimmed layer to any underlying Hub control, including
that switch. The tour must never toggle it, focus it as a target, or call its
action. A regression test must record its value before Finish, Skip, and Replay
and prove it is unchanged afterwards.

The tour must never start before the Website Hub has loaded, while a blocking
modal is open, or for a member who lacks Website access.

## Stable targets and readiness

Use semantic target attributes only where needed; never depend on DOM order or
`nth-child` selectors. The final naming can follow local conventions, but the
intent should resemble:

```ts
export const WEBSITE_TOUR_TARGETS = {
  overview: '[data-tour="website-overview"]',
  templates: '[data-tour="website-templates"]',
  pages: '[data-tour="website-pages"]',
  design: '[data-tour="website-design"]',
  media: '[data-tour="website-media-assets"]',
  navigation: '[data-tour="website-navigation"]',
  publishedPreview: '[data-tour="website-published-preview"]',
} as const;
```

Use component state/effects and the current NextStep lifecycle API to wait for
targets. A short-lived `MutationObserver` is acceptable when necessary, but it
must disconnect on target resolution, unmount, skip, and completion. Do not use
arbitrary multi-second timeouts or permanent DOM polling.

## Provider and code structure

Keep tour code admin-only and lazy-loaded. Mount its provider at the narrowest
level that covers the Website Hub and its replay entry point; do not wrap the
public site or introduce a global provider without a demonstrated need.

Suggested structure, adjusted to existing conventions during implementation:

```text
apps/admin/
  components/onboarding/
    WebsiteHubTour.tsx
    WebsiteTourLauncher.tsx
    websiteTourDefinition.ts
    websiteTourTargets.ts
    websiteTourEligibility.ts
    websiteTourState.ts
  lib/
    websiteTour.server.ts
```

Separate definition, eligibility, persistence, selectors, and UI logic. Avoid
a single large component with imperative DOM operations and many booleans.

## Development and demo support

Use one authenticated Hub-local trigger, `?tour=website`, for the Replay
Website tour action and the existing launch checklist link. It bypasses only
the completed/skipped suppression for an already eligible member; it never
bypasses authentication, tenant membership, Website access, or the server-owned
demo-tenant allowlist. It also serves as the development/test override instead
of maintaining a second mechanism.

Provide a small internal reset helper for tests and demo preparation. Its
operator interface should accept a tenant slug, resolve the sole current member
only when exactly one exists, default to a dry run, and require an explicit
`--apply` to clear that member’s three Website-tour fields. It must not print
secrets or alter any website data. Document its exact invocation. The demo host
runs it for the selected account before a live demo; do not rely on browser
storage or manual database edits.

Implementation command:

```sh
# Shows the targeted demo workspace; writes nothing.
npm run reset:website-tour -- --tenant demo-sean

# Explicitly clears only that sole member's Website-tour state.
npm run reset:website-tour -- --tenant demo-sean --apply
```

## Accessibility, themes, and performance

The selected NextStep configuration must preserve:

- keyboard navigation, visible focus, and accessible buttons;
- Escape/Skip behavior if the library supports it;
- no keyboard trap;
- readable copy and contrast in light and dark admin themes;
- usable narrow-width behavior;
- reduced-motion behavior where the library supports it;
- cleanup of observers/listeners when the tour exits.

Tour code must not be bundled into public dealership pages or affect public
site performance.

For v1, closing with Escape or the tour’s close affordance is semantically the
same as Skip: persist `skipped_at` for the current version, close all overlay
state, and do not auto-launch again. Manual replay remains available.

## Tests

Use existing LUME test patterns. At minimum add coverage for:

- all three rollout demo tenants auto-enable the tour;
- another tenant does not auto-enable it;
- completion suppresses automatic launch after refresh;
- skip suppresses automatic launch after refresh;
- replay works after complete/skip;
- Escape/close persists the same skipped state as the explicit Skip control;
- refreshing mid-tour starts again at step one and does not write completion or
  skipped state;
- state is tenant/member scoped;
- version changes are handled correctly;
- unavailable/missing targets fail safely without crashing the Website Hub;
- public dealership routes do not render tour code;
- target attributes are attached to the intended hub controls;
- the Loading animation switch is never a target and remains unchanged after
  completing, skipping, or replaying the tour;
- overlay pointer handling prevents clicks from reaching dimmed Hub controls;
- persistence uses the authenticated member and active tenant.

Add focused browser coverage when the existing authenticated Playwright setup
can support it:

1. eligible user, first Website Hub visit → tour starts;
2. finish → refresh → no automatic relaunch;
3. skip → refresh → no automatic relaunch;
4. replay starts after completion;
5. non-eligible tenant/user → no tour;
6. readable in both admin themes.

Run the real release gates:

```sh
npm run typecheck:all
npm test -- --run
npm run build
npm run build:admin
npm run check:migrations
git diff --check
```

## Implementation sequence

1. Inspect the current NextStep API, Website Hub component tree, permissions,
   existing launch checklist, and preference data path.
2. Confirm whether the demo rollout is tenant-wide or strictly limited to the
   three current people. Stop for product direction if this is ambiguous.
3. Submit the small persistence migration for approval before applying it.
4. Add typed preference helpers, server-owned eligibility, and version rules.
5. Add the lazy admin-only NextStep provider and Website Hub launcher.
6. Add stable targets and concise tour definitions grounded in the actual Hub:
   Templates, Pages & content, Design/identity/media, Header & navigation,
   Launch readiness, and Published website preview—not a nonexistent Hub
   publish button.
7. Add Replay Website tour to the Hub and a link from the existing launch
   checklist.
8. Add development/demo reset support, tests, and concise documentation.
9. Run release gates and verify one eligible demo account plus one
   non-eligible account manually before any broader rollout.

## Definition of done

- Only the intended demo cohort auto-receives the Website Hub tour.
- Completion and skip persist per authenticated member and tenant.
- Replay works without destroying history.
- No tour action changes website data or navigates away from the Hub.
- The existing launch checklist points users to the Website tour instead of
  competing with it.
- Public dealership pages have no tour code or visual impact.
- The feature is accessible, theme-safe, tested, and documented.
- No raw account identifiers, secrets, or credentials are exposed.
