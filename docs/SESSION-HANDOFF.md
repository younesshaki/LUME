# LUME — Session Handoff

_Last updated: 2026-07-05. Read `CLAUDE.md` first, then this. This captures
live state + in-flight work that isn't obvious from the code alone._

## TL;DR of current state

### 2026-07-06 (later): custom pages live in the public header (`d8ea67e`, pushed)

- Root cause of "published page redirects to homepage": no public route for
  custom slugs + PageRenderer flag-gated + blocks only registered when the
  flag was on. All three fixed: `/:pageSlug` route renders custom pages
  unconditionally (`force` prop — they have no cinematic fallback);
  `registerBlocks()` now unconditional inside the lazy renderer chunk.
- **Header nav is now data-driven**: published, non-archived pages in
  Pages-screen drag order via anon RPC `list_published_nav_pages`
  (migration **025 applied**; advisors show only the known intentional
  SECURITY DEFINER warnings), capped by `tenants.theme.header.maxNavItems`
  (default 6). Hardcoded nav remains the loading/failure fallback.
- **New admin section `/admin/[tenant]/navigation`** (sidebar: Navigation):
  max pages in header, CTA show/hide + label, live visible/overflow
  preview. `selectHeaderNav()` in @lume/types keeps admin preview and
  public header in lockstep. BrandingClient now MERGES theme on save
  (was replacing — would have wiped theme.header).
- NOTE: default tenant's `food` page (nav_order 6) overflows the default
  cap of 6 — expected; bump maxNavItems in Navigation or reorder in Pages.
- Verified in a real browser against local Vite + prod Supabase: custom
  page in header, click-through + deep link render, unknown slug → /home.
  12/12 admin e2e, 184 unit tests, builds clean. Reminder: `codex/web-move`
  needs a rebase to pick these src/ changes up under apps/web/src/.

### 2026-07-06: apps/web move READY ON BRANCH `codex/web-move` (`0c2688f`, pushed, NOT merged)

The Vite public site now lives at `apps/web/` (`@lume/web`) on the branch,
per the checklist in `docs/scalability/monorepo-foundation.md`. Fully
verified on the branch: `typecheck:all`, `npm test` (121 root + 58 web),
`build` (outputs `apps/web/dist`), `build:admin`, Vite dev boots and
serves from the new location, 11/11 admin e2e. Key mechanics:

- Root package.json is a thin workspace shell; dev/build/preview/test
  delegate to `@lume/web`. Root vitest covers apps/admin + packages
  (jsdom + react plugin for the component tests); web has its own config.
- `VITE_*` env still loads from the repo-root `.env.local` (`envDir`).
- Root `api/*` functions did NOT move — the public Vercel project's Root
  Directory stays `.`, so **no Vercel project-settings change is needed**;
  only `vercel.json`'s `outputDirectory` changed (`apps/web/dist`).
- Coupling fixes: generateEmbeddings / check-r2-assets / seed-default-tenant
  paths, .gitignore negations, CLAUDE.md layout+commands.

**Merge checklist (user review required — do not merge autonomously):**

1. Re-verify on the branch after any main drift: `git rebase main` (or
   merge main in), then `npm install --legacy-peer-deps`,
   `npm run typecheck:all && npm test && npm run build && npm run build:admin
   && npm run test:e2e`.
2. Confirm the branch's **preview deployment** of the `lume` Vercel project
   serves the site correctly (branch push already triggers it) — check `/`,
   a vehicle page, `/api/vehicles` (function still routed), and chat reaches
   the admin proxy.
3. Merge to main → production deploy uses the new `outputDirectory`
   automatically. Do NOT change the Vercel project's Root Directory — it
   must remain `.`.
4. After merge: `rm -rf node_modules && npm install --legacy-peer-deps`
   locally; any personal worktrees/branches touching root `src/**` must be
   rebased (paths moved to `apps/web/src/**`).
5. Update any external references to root paths (e.g. Codex lane
   assignments that say `src/**` now mean `apps/web/src/**`).

### 2026-07-06: first-run branding SHIPPED (`aeb0a4b`, pushed)

- `provisionTenant()` now seeds `tenants.theme` with `DEFAULT_TENANT_THEME`
  (new canonical constant in `@lume/types`; the branding editor's defaults
  derive from it — single source of truth, lockstep unit test). New sites
  render themed from the first pageview. Live-verified on prod with a
  throwaway tenant (then deleted). Jira: comment on SCRUM-107.
  Onboarding-backlog item 6 closed.

### 2026-07-06: leads & platform table parity SHIPPED (`686ab50`, pushed)

- Both tables now use the vehicles pattern: URL-param `q`/`sort`/`dir`/`page`,
  server-side search/sort/pagination (25/page). Leads searches
  name/email/phone; platform searches name/slug and only resolves
  members/owner emails for the visible page. Jira: comment on SCRUM-81.

### 2026-07-06: analytics charts SHIPPED (`c0fadd5`, pushed)

- `/admin/[tenant]/analytics`: 30-day leads area chart, inventory-by-make
  and by-body-style bars (top 8 + Other), price histogram with friendly
  buckets. Pure aggregations in `lib/analytics.ts` (+7 tests, 178 total);
  shadcn `chart.tsx` + recharts 2.15. Gold mark color validated per the
  dataviz method (light `oklch(0.58 .12 88)`, dark `oklch(0.655 .12 88)`).
- ⚠️ recharts 2.x under React 19 requires the `react-is: ^19` override —
  it's set in BOTH the root and apps/admin package.json (npm ignores root
  overrides for workspace deps). Don't remove either. Mount animations are
  disabled on the charts (deterministic e2e screenshots). Jira: SCRUM-90.

### 2026-07-06: invite → signup handoff SHIPPED (`9781dc7`, pushed)

- `/invite/[token]` (signed out) now links to `/signup?invite=<token>`;
  signup with an invite hides the site-name field, stashes no site_name
  metadata, and returns to the invite after account creation (or via
  `/login?next=` on the email-confirm path) — auto-provisioning skipped.
  Pure token validation in `lib/signupDestination.ts` (+4 tests, 171
  total). Jira: comment on SCRUM-107. Onboarding-backlog item 3 fully done.

### 2026-07-06: window.confirm eliminated (`1b0f944`, pushed)

- Shared `components/confirm-action-dialog.tsx` (shadcn alert-dialog +
  sonner toast, the vehicles/DeleteButton pattern) now guards: domains
  remove, knowledge delete, team member remove (self-lockout warning),
  pages archive (neutral button) and pages delete (destructive). Zero
  `window.confirm` left in apps/admin. Jira: comment on SCRUM-81 (Epic A).

### 2026-07-06: CSV import modes + duplicate detection SHIPPED (`d553408`, pushed)

- `/admin/[tenant]/vehicles/import` now offers **Add vs Replace** ("Replace
  entire inventory" = delete-then-insert behind a destructive confirm
  dialog) and **duplicate detection** against current inventory
  (external_id first, else normalized year+make+model+trim+mileage) with
  per-row skip/import checkboxes + a summary line. Duplicates default to
  skipped, so re-uploading the same feed is now a no-op instead of doubling.
- Pure logic: `findDuplicates()` in `apps/admin/lib/vehicleImport.ts`
  (5 new unit tests → 167 total). e2e suite extended with a re-import +
  replace journey (10 tests). Jira: SCRUM-161 progress comment.

### 2026-07-05 (night): Playwright e2e smoke suite SHIPPED (`b54d8ac`, pushed)

- **`npm run test:e2e`** (root or apps/admin): 9 tests covering the whole
  paying-customer journey — signup → onboarding provisions a tenant → shell
  (tenant switcher, no Platform nav for non-admins) → vehicles empty state →
  CSV import (5-row fixture) → search/sort → alert-dialog delete → leads →
  `/admin/platform` 404s for non-admins → sign out + middleware re-lock.
- Mechanics: Playwright starts the admin dev server itself (`webServer`,
  reuses a running one); throwaway user `lume-e2e-smoke@example.com` +
  tenant created through the real UI, destroyed via service role in global
  setup (leftover sweep) + teardown. Verified 0 leftovers on prod after runs.
- NOT part of `npm test` (vitest excludes `apps/admin/e2e/**`). Jira:
  SCRUM-213 (created + evidence comment). Signup-with-session works, i.e.
  Supabase email confirmation is currently OFF — if it's ever enabled the
  first e2e test will catch it (lands on "Check your email").

### 2026-07-05 (later): self-serve SaaS onboarding SHIPPED (`bcc173f`, deployed)

- **Signup → site:** `/signup` → `/admin/onboarding` → `provisionTenant()`
  (@lume/db): unique slug, owner membership, default persona, starter pages
  (DEFAULT_PAGES now lives in @lume/blocks). Idempotent; e2e-tested against
  prod including cascade cleanup.
- **Every tenant viewable:** public site resolves tenant at runtime
  (subdomain → persisted `?tenant=` → build default); per-tenant
  "View website" links in the admin sidebar (`?tenant=slug&preview=lume`).
- **Platform-owner layer:** migration **024 applied** (advisors: only the
  known intentional SECURITY DEFINER warnings). `platform_admins` +
  `is_platform_admin()`; `tenant_ids_for_current_user()` /
  `user_has_tenant_role()` extended so platform admins pass every tenant's
  RLS. `/admin/platform` lists all tenants (owner email, members) with
  one-click Enter. hakicsi89@gmail.com seeded. RLS verified by JWT
  simulation for both admin and non-admin.
- 162 tests; all builds clean; deployed and live-verified
  (/signup 200, /admin/platform auth-gated, runtime-tenant bundle live).
- Still open for the full vision: canonical subdomain/custom-domain public
  URLs (needs apps/web move + wildcard domain), invite→signup handoff,
  DeepSeek balance for live chat replies.


- **Branch:** `main`, **pushed and deployed 2026-07-05** (`8acad9d`, both
  Vercel projects READY). Live-verified: public /api/chat proxies through
  lume-admin-five to the chat route and returns DeepSeek's 402 (balance
  gate) — the full pipe works; only the LLM reply is missing.
- **Local main contains (unpushed):**
  1. `99337cd` Codex merge — complete `Database` types, zero `as any`
     Supabase casts in admin, first admin unit tests.
  2. `2371f7e` **SCRUM-144 + 119** — `@lume/bot` wired into the admin
     `/api/chat`; root `api/chat.ts` reduced to a thin proxy.
  3. `b8e8008` proxy hardening + onboarding backlog + docs.
  4. `be730fc` **chat honors bot_personas** — voice/tone via
     `personaBasePrompt`, capability enforcement on every action path.
  5. `fd110b9` **`npm run create:tenant`** single-command provisioning
     (blank tenant + owner + persona + pages; `--with-sample-data` opt-in).
  6. `8abc8be` persona **name** flows to the visitor chat UI (meta event).
  7. `a54ae69` **SCRUM-112 rate limiting** — 10 chat req/min/IP, 429 +
     Retry-After; proxy forwards x-forwarded-for.
  8. `0aa11ce` **admin CSV inventory import** —
     `/admin/[tenant]/vehicles/import`, preview + per-line validation +
     batched RLS-enforced insert (onboarding-backlog item 2).
  9. `f01d5d0` **invite-accept flow** — `/invite/[token]` + "Copy invite
     link" in the team UI (backlog item 3, accept half; invitee signup
     still missing).
- **Verification baseline:** `npm run typecheck:all` clean, `npm test` =
  **159 passing**, builds clean. Chat verified end-to-end vs a mock LLM
  upstream with real DB queries (persona prompt, tool actions, botName in
  meta, 429 on the 11th request).
- **Jira annotated** with evidence comments: SCRUM-144, 119, 97, 115, 112.
- **Two tenants now exist:** `default` (1009 vehicles, 6 pages) and `demo`
  (`efab59f0-…`, 1000 vehicles, 5 pages, seeded 2026-07-04 via the seed
  scripts as an onboarding dry-run). Isolation verified end-to-end as anon.
  Gaps found are ranked in `docs/onboarding-backlog.md`.

## ⚠️ Deploy prerequisites (updated 2026-07-05 — only ONE remains)

Vercel config was completed via API this session:

- ✅ `LUME_CHAT_UPSTREAM_URL=https://lume-admin-five.vercel.app/api/chat` set
  on `lume` (production+preview). **`lume-admin-five.vercel.app` is the real
  admin production alias** — and its API routes are publicly reachable
  (verified: POST /api/chat reaches DeepSeek). `lume-admin.vercel.app` is
  still a foreign prototype project; never use it. SSO protection only bit
  on the git-branch aliases.
- ✅ `LUME_CHAT_BYPASS_SECRET` created on lume-admin + set on `lume`
  (belt-and-braces; the proxy sends it if present).
- ✅ `ALLOWED_CHAT_ORIGINS` on lume-admin already includes
  `https://lume-jade-three.vercel.app` (+ localhost:5173).

Remaining before push:

1. **DeepSeek account has NO balance** — `402 Insufficient Balance` verified
   against the deployed admin. Top up, and rotate the key while at it
   (SCRUM-115): update `DEEPSEEK_API_KEY` on the **lume-admin** Vercel
   project (+ local `apps/admin/.env.local`); after deploy, delete the copy
   on the public `lume` project.
   Note: pushing before the top-up deploys fine — chat just returns the 402
   error until the balance exists.

## What was built this session (2026-07-04)

- **SCRUM-144 (I-1):** admin `/api/chat` now does phase-1 non-streamed
  DeepSeek call with `toToolSpecs()`; on `tool_calls` → `runToolCalls`
  (tenant-scoped via new `queryTenantVehicles`/`getTenantVehicle` in
  `@lume/db`, anon client so RLS backstops) → phase-2 streamed follow-up.
  Tool `BotAction`s are emitted as SSE `action` events after `meta`; no-tool
  replies are re-emitted in the same SSE shape (client contract unchanged).
  One tool round per turn by design. **Verified against a mock upstream with
  real DB queries** (find_vehicles → filter_inventory action → streamed
  prose); real-key test blocked only by the DeepSeek balance.
- **SCRUM-119:** root `api/chat.ts` is a proxy (requires
  `LUME_CHAT_UPSTREAM_URL`, optional `LUME_CHAT_BYPASS_SECRET`); single chat
  implementation lives in the admin app.
- **Codex lane (merged):** `tenant_domains`/`bot_personas`/`loyalty_*`/
  `tenant_invites` in the `Database` type; admin `as any` casts gone; admin
  unit tests for tenant/origin/team helpers.
- **Hero-gap fix (pushed earlier as `15d3416`):** page-builder hero no longer
  inherits the hand-built 100vh min-height (`.pageBuilderHero` override).
- **Second tenant `demo` + `docs/onboarding-backlog.md`** (the ranked list of
  what real customer onboarding still needs — top item: a second tenant has
  no public website because `VITE_LUME_TENANT` is baked per build).
- **Cleanup:** 27 merged branches deleted; Codex worktrees
  `LUME-admin-surfaces{,-2}` removed. Remaining branches are unmerged or
  attached to personal worktrees.
- **apps/web trigger condition** documented in
  `docs/scalability/monorepo-foundation.md`: move before any work that makes
  a second tenant publicly reachable.

## Immediate next steps

1. User: DeepSeek top-up + key rotation + the env vars above → then push
   main → live-verify chat tool-calling on prod (ask about the cheapest
   Porsche; expect `filter_inventory` action + streamed prose, and the
   persona name in the chat header).
2. Start on `docs/onboarding-backlog.md` item 1 (public reachability for a
   second tenant) — but do the apps/web move first per the trigger
   condition; a coupling audit is now in
   `docs/scalability/monorepo-foundation.md`.
3. Remaining backlog: invite-accept/signup flow (item 3), CSV inventory
   import UI (item 2), hosted embedder (item 8), lifecycle/billing (item 9).

## Parallel-agent (Codex) workflow that has been working

Claude + Codex run in parallel on **disjoint file lanes** to avoid conflicts:
- This session Codex took `packages/db/src/**` (types), `apps/admin/app/admin/**`,
  `apps/admin/lib/**`; Claude took `apps/admin/app/api/**`, root `api/**`,
  `packages/db` (vehicleQuery), `src/**`, docs.
- Codex branches off `origin/main` into `codex/*`, verifies
  (`typecheck:all`/`test`/`build:admin`), does NOT push/deploy/migrate.
  Claude reviews, merges, verifies on main, pushes (with approval).
- Before merging, always confirm zero shared files:
  `comm -12 <(git diff --name-only origin/main..A|sort) <(git diff --name-only origin/main..B|sort)`.

## Hard rules (from CLAUDE.md + session guardrails — do not violate)

- Public reads use **anon key + RLS only**; service-role (`createServiceClient`)
  only in trusted server routes, **never** in a client component.
- Everything tenant-scoped: `tenant_id` column + RLS + also `.eq("tenant_id", …)`
  for defense in depth.
- `leads` has **no anon insert** — writes go through trusted routes only.
- Never commit/echo secrets. `VITE_DEEPSEEK_API_KEY` must never ship to browser.
- Migrations = live-on-prod; `list_tables` before, `get_advisors` after.
- Don't push to `main` / deploy / apply migrations without explicit approval.

## Key locations

- Vision/architecture: `docs/vision/product-vision.md`,
  `docs/architecture/ADR-003-page-content-storage.md`.
- Onboarding gaps: `docs/onboarding-backlog.md`. Project assessment:
  `docs/PROJECT-ASSESSMENT-2026-07-03.md`.
- Chat: `apps/admin/app/api/chat/route.ts` (canonical) + `api/chat.ts` (proxy).
  Bot: `packages/bot/` (README has the wiring contract, now implemented).
- Tenant resolution: `apps/admin/lib/tenant.ts`; public: `src/lib/publicTenant.ts`.
- Page renderer + preview flag: `src/lib/pageBuilder/` (`?preview=lume`).
- Jira: `hakicsi89.atlassian.net`, project **SCRUM** (Atlassian MCP).
