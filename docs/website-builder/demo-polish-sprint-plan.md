# Website Builder — Demo-Polish Sprint Plan

- **Date:** 2026-09-26
- **Replaces:** the earlier sprint draft ("fix the header overlap, add the VDP
  template"). Both of those problems were already fixed on 2026-07-30, see
  below.
- **Goal:** the website builder is safe to demo live to a potential
  collaborator (Sean). Nothing breaks, errors or looks unfinished on camera.
  This sprint is polish, not new capability.

## 0. Ground truth (verified on `origin/main`, 2026-09-26)

All four phases of [builder-gaps-plan.md](builder-gaps-plan.md) shipped on
2026-07-30:

| Phase | Commit | What exists now |
|---|---|---|
| 1. Header overlap | `db4e298`, `38d575b` | Three-track grid header. The fit calculation is a pure function (`src/components/layout/nav/navOverflow.ts`, tested). A measured desktop "More" menu is rendered outside the header, so the deliberately kept `overflow-hidden` cannot clip it. |
| 2. Vehicle detail page (VDP) editing | `a1ace8b` | A `vehicle` template in `packages/blocks/src/dealerPageTemplates.ts` (vehicle-detail, finance and call-to-action blocks, with car-agnostic copy). It is seeded through `seed-default-pages.ts` and `create-tenant.ts`. The admin Pages list has a `VehicleLayoutPanel` that presents it as the layout for every vehicle. `vehicle` is excluded from navigation. |
| 3. Block variants | `df10f84` | First-class `variants` on the block descriptor, with a slideshow picker. |
| 4. Header and footer variants | `e12f895` | Header: `centred`, `left`, `split`, `minimal`. Footer: `columns`, `stacked`, `minimal`. Both have real configuration. |

Production data:

- `demo` is the only tenant with a **published** vehicle layout.
- `default` and `secondplace` have none.

Live site designs in production (`tenants.theme.template`):

- `default`: **Concierge**.
- `demo`: **Luxury**, with the `centred` header and `stacked` footer.
- `secondplace`: **no template stored**.

Two gaps reported by the owner on 2026-09-26, confirmed in the code:

- **The visitor can't tell which page they're on.** `deriveActiveNavKey` in
  `SiteHeader.tsx` only matches an exact top-level slug or the cinematic
  screen, so a vehicle page (`/vehicles/:id`), a filtered inventory URL or
  a nested custom page highlights nothing. When it does match, the only marker
  is gold text plus a 1-pixel underline (`NavLink.tsx`), which is nearly
  invisible on some tenant themes.
- **The dashboard's Templates section doesn't show the current template.**
  `TemplatesClient.tsx` only adds a small "Live" badge to one card among
  five. For a tenant with no stored template, `templates/page.tsx` falls back
  to `createDefaultSiteDesign("luxury")`, so Luxury is labelled "Live" even
  though the tenant never chose it.

Both are tasks below: A5 and B5.

**Therefore:** don't rebuild any of this. First task for each agent: update the
status line of `builder-gaps-plan.md` to "all four phases shipped 2026-07-30"
(the docs branch for this plan already does it).

## 1. Demo setup

- **Demo tenant:** `demo`. It has the vehicle layout live, so it can show the
  builder controlling every vehicle page.
- **Public site:** `https://lume-jade-three.vercel.app/?tenant=demo`.
- **Admin:** `https://lume-admin-five.vercel.app/admin/demo`.
- **Environment for the walkthrough:** the local production-parity stack
  (`npm run parity:staging`), or staging. **Never publish test content to
  `demo` in production** while walking through; use a throwaway draft page and
  delete it afterwards.

## 2. Workstreams

The two agents work in parallel. Each owns separate files, and they coordinate
through `docs/website-builder/SPRINT_LOG.md`.

### Lane A: Claude Code — public site, rendering and live preview

Branch: `chore/demo-polish-public`. Owns:

- `src/components/layout/**`
- `src/lib/pageBuilder/**`, **except** `PageRenderer`'s registry wiring when
  Lane B adds a block
- `packages/blocks/src/previewProtocol.ts`, and block components under
  `src/lib/pageBuilder/components/**`

Tasks:

1. **Header and footer stress matrix.** Cover:
   - every header variant (`centred`, `left`, `split`, `minimal`) × logo left
     or centre;
   - 1, 6 and 10 navigation items;
   - viewport widths 360, 768, 1024, 1440 and 1920 px;
   - light and dark mode;
   - every footer variant (`columns`, `stacked`, `minimal`).

   For each combination, confirm there is no overlap, clipping, horizontal
   scroll or unreachable item. The More menu must open and close with mouse
   and keyboard, and close on route change. Record the matrix as a Playwright
   spec with page elements stubbed. Add a pure-function test for any geometry
   rule you change.
2. **Vehicle page on `demo`.** Load three real `/vehicles/:id` URLs. Check
   gallery, specs, finance calculator and call to action. Check the fallback by
   loading the same URLs through a tenant **without** a vehicle layout
   (`default`), not by unpublishing `demo`'s.
3. **Live preview accuracy.** For every block type the demo will touch, change
   each editable property in the editor and confirm the preview iframe
   (`previewProtocol.ts`) updates without a reload and without console errors.
   Add a protocol test for every mismatch you fix.
4. **Console-clean public pages.** Home, inventory, a vehicle page, contact,
   and every published `demo` page must load with zero console errors and zero
   failed requests (Playwright `page.on("console")` and
   `page.on("requestfailed")`).

5. **Show the current page in the header (reported gap).** Make the active
   page obvious on every surface: the desktop nav in all four variants, the
   gooey nav, the "More" menu, the mobile menu and the bottom dock.
   - **Derivation:** extract `deriveActiveNavKey` from `SiteHeader.tsx` into a
     pure, tested module. It must resolve:
     - exact pages;
     - **nested routes to their section** (`/vehicles/:id` and
       `/vehicles#vehicles?...` → Inventory; `/products/:id` → Products);
     - custom published pages, including nested slugs;
     - the home and cinematic screens.
   - **Priority rule:** the longest matching nav path wins, and a query or
     hash never breaks a match.
   - **Overflow:** when the active item has moved into the "More" menu, the
     "More" trigger itself shows the active state, so the visitor can still
     see where they are.
   - **Visuals:** replace the 1-pixel underline with a clearly visible
     indicator that fits each variant (for example a pill or underline of at
     least 2 px, plus weight or contrast), using theme tokens. Check contrast
     of at least 3:1 against the header background in light and dark mode
     for every production tenant theme (Luxury, Concierge, default fallback).
     Keep `aria-current="page"` on exactly one item.
   - **Tests:**
     - a table-driven unit test of the derivation (every route shape above);
     - a Playwright check that exactly one `aria-current="page"` exists after
       navigating to home, inventory, a filtered inventory, a vehicle page, a
       custom page, and a page whose nav item is in the "More" menu;
     - the same check after a concierge-driven navigation.

### Lane B: Codex — admin editor and Pages list

Branch: `chore/demo-polish-admin`. Owns:

- `apps/admin/app/admin/[tenant]/pages/**` (list, new page, editor, vehicle
  layout panel)
- `apps/admin/components/**` used only by the Pages and editor surfaces
- `apps/admin/app/admin/[tenant]/website/**` (header and footer settings)

Tasks:

1. **Editor flow, end to end.** Create page → add block → edit properties →
   preview → publish → view it live, for at least **five** block types. Use the
   ones the demo will show: hero, featured vehicles, finance calculator,
   trade-in form, and a call-to-action banner. Fix every dead click, console
   error, broken preview, lost edit and confusing empty state.
2. **Vehicle layout panel.** The panel must say plainly that this layout applies
   to every vehicle, preview against a real sample vehicle, and make
   create/publish/unpublish clear and reversible. Cover all three states with a
   test.
3. **Header and footer settings.** Every variant, logo placement, call to
   action and footer-column control must reflect in the preview immediately and
   survive save and reload.
4. **Admin console clean.** Pages list, editor and website settings must load
   with zero console errors.

5. **Show the current template in the Templates section (reported gap).** In
   `apps/admin/app/admin/[tenant]/templates/`:
   - **Top panel.** Add a "Your current template" panel above the grid. It
     shows the live template's name and preview, its version and when it was
     published, the header and footer variants in use, and the primary
     actions (Customize / Continue draft / Preview live site).
   - **The live card.** In the grid, list the live template first and mark it
     clearly: a "Current" badge plus a highlighted border, not only the small
     "Live" badge.
   - **Be truthful when nothing is stored.** In `page.tsx`, pass whether a
     template is actually stored, instead of silently defaulting to Luxury.
     When none is stored (today: `secondplace`), the panel says "No template
     applied yet: your site uses the built-in default", and no card is marked
     current.
   - **Drafts.** Show a working draft of a *different* template as "Draft in
     progress", distinct from the current one.
   - **Scope:** read only. No data or migration change is needed, because the
     live template is already in `tenants.theme.template`.
   - **Tests:** a component test for three cases (stored template, no stored
     template, a draft of another template), and a check against production
     data shapes: `default` shows Concierge, `demo` shows Luxury,
     `secondplace` shows the default notice.

### Shared rules

- **Stay in your lane.** If a fix needs a file the other lane owns, post the
  change you need in `SPRINT_LOG.md` and wait. Don't edit it.
- **Log format.** `SPRINT_LOG.md` is append-only:
  `- 2026-09-26T14:05Z · Claude · starting A1 header matrix` (UTC timestamp,
  agent, lane task, one line). Create it if missing, and never rewrite another
  agent's line.
- **Whoever finishes first** posts a claim, then takes the other lane's
  unclaimed tasks, and only those.

## 3. Out of scope (don't build)

- New block types, new header or footer variants, new template families. See
  [ui-component-sources.md](ui-component-sources.md) for the next sprint.
- `packages/bot`, `packages/rag`, chat and concierge code, CRM, billing,
  loyalty and webhooks.
- Any Supabase migration. `apply_migration` is live on production. If one seems
  necessary, stop and post in the log instead.
- Anything that would put a server-only secret (`SUPABASE_SERVICE_ROLE_KEY`,
  `DEEPSEEK_API_KEY`, `ALLOWED_CHAT_ORIGINS`, provider keys) into a `VITE_`
  variable or a client component.

## 4. Quality bar

- **Tests with every fix:** every fix ships with a test that fails before it
  and passes after. Layout and geometry rules get a pure-function test, not
  only a screenshot.
- **Coverage:** `src/` test coverage must not get worse. Today there are 54
  test files for 339 source files.
- **Before handing back:**
  - `npm run typecheck:all`
  - `npm test -- --run`
  - `npm run build`
  - `npm run build:admin`
  - `npm run check:migrations`
  - `git diff --check`
  - the relevant Playwright suite
- **Known flaky test:** `e2e/concierge/navigate-back.spec.ts` "successive
  concierge filters…" fails about 3 in 8 runs on `main`. Don't count it as a
  regression, and don't fix it in this sprint.

## 5. Release

- **Don't merge.** Each agent leaves its branch ready for review.
- **Order:** integration merges both lanes into one release branch, then
  `staging` (PR), then validation on both staging deployments, then
  `staging` → `main` (PR). This is the normal flow in
  `docs/deployment-environments.md`. Never go straight to `main`.

## 6. Deliverable per branch

- What changed and why, in plain language.
- How it was verified: which tests, what was checked by hand and at which
  viewport sizes.
- Remaining risks or known limits.
- Confirmation that every quality-bar command above passes, with test counts.
