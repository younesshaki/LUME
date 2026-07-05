# LUME — Session Handoff

_Last updated: 2026-07-05. Read `CLAUDE.md` first, then this. This captures
live state + in-flight work that isn't obvious from the code alone._

## TL;DR of current state

- **Branch:** `main`, local is **12 commits ahead of origin — NOT pushed**
  (push = auto-deploy of both Vercel projects; blocked on the deploy
  prerequisites below).
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
  meta, 429 on the 11th request). Local main is 12 commits ahead of origin.
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
