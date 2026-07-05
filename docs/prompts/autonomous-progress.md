# Mission: Autonomous progress on LUME — run until usage limit

You are working in the LUME monorepo (`/Users/younesshaki/Documents/LUME`).
Read `CLAUDE.md`, then `docs/SESSION-HANDOFF.md`, then `docs/onboarding-backlog.md`
BEFORE any work — they are current and accurate. Trust them over your instincts.
Then work through the priority queue below, one item at a time, completely,
until you run out of usage. Do not ask the user anything; every item here is
pre-authorized under the stated rules.

## Ground truth (verified 2026-07-05 — do not re-derive)

- Both Vercel projects deploy from `main` on push. Admin production URL is
  `https://lume-admin-five.vercel.app` (NEVER `lume-admin.vercel.app` — foreign
  project). Public site: `https://lume-jade-three.vercel.app`.
- Chat pipeline (bot tool-calling, personas, rate limiting) is deployed and
  correct; it returns DeepSeek 402 in prod because the account has no balance.
  That is USER-ONLY — do not touch keys or try to fix it.
- Admin was just overhauled onto shadcn/ui (gold theme, sidebar shell, Cmd+K).
  Self-serve signup → auto-provisioned tenant works. Platform-admin layer
  (migration 024) works. 162 tests, typecheck/builds green at start.

## Rules

- Verification loop after EVERY commit: `npm run typecheck:all`, `npm test`,
  `npm run build:admin`, `npm run build`. All green before moving on.
- Commit small; work directly on `main` and push after each verified item,
  EXCEPT: anything touching `vercel.json`, build commands, or moving the Vite
  app — that goes on branch `codex/web-move`, verified, NOT merged, summarized
  for user review.
- Supabase migrations: `list_tables` before, `get_advisors` after; migrations
  are live-on-prod. Only additive schema changes (new tables/columns/indexes);
  never drop/alter existing columns autonomously.
- Never echo/commit secrets. Public reads = anon key + RLS. Everything
  tenant-scoped: RLS + explicit `.eq("tenant_id", …)`.
- After finishing each item: update `docs/SESSION-HANDOFF.md` (and the
  onboarding backlog if relevant), and annotate the matching Jira SCRUM issue
  via the Atlassian MCP with an evidence comment (board transitions are
  restricted — comments only).
- If an item proves blocked, write down why in the handoff and move to the
  next. Never stop early because the session is long.

## Priority queue (in order — highest real-progress-per-token first)

1. **Playwright smoke suite** (biggest quality gap; a provider crash shipped
   because nothing tests behind login). Add Playwright to apps/admin
   (`--legacy-peer-deps`), config with a dev-server webServer. Cover, against
   local dev with a throwaway Supabase user (create/delete via service role
   in global setup/teardown): signup → onboarding → tenant provisioned →
   admin shell renders (sidebar, tenant switcher) → vehicles empty state →
   CSV import (small fixture) → rows appear → search/sort → delete with
   dialog → leads page → platform page hidden for non-admin → sign out.
   Wire an `npm run test:e2e` script; do NOT add it to the default `npm test`.
   Document how to run it in CLAUDE.md's command table.
2. **CSV import hardening for real dealers** (append-only import doubles
   inventory on re-upload). Add an import mode choice to
   `/admin/[tenant]/vehicles/import`: "Add to inventory" vs "Replace entire
   inventory" (delete tenant's vehicles then insert, in that order, with a
   styled confirmation dialog), plus duplicate detection in the preview
   (match on external_id when present, else year+make+model+trim+mileage)
   with per-row skip/import decisions summarized before commit. Extend
   `lib/vehicleImport` tests.
3. **Styled confirm dialogs** — replace the 5 remaining `window.confirm()`
   sites (domains, knowledge, team, pages ×2) with the shadcn alert-dialog +
   sonner toast pattern already used by vehicles/DeleteButton.
4. **Invite → signup handoff** — `/invite/[token]` for a visitor with no
   account should link to `/signup?invite=<token>` which, after account
   creation, returns to the invite instead of provisioning a new tenant
   (skip auto-provisioning when an invite param is present). Cover with a
   unit test on any new pure logic.
5. **Analytics upgrade** — shadcn `chart` (recharts) on
   `/admin/[tenant]/analytics`: leads over time, inventory by make/body
   style, price distribution. Server-fetch data, keep queries tenant-scoped.
6. **Leads & platform table parity** — search + sort + pagination matching
   the vehicles pattern (URL-param driven, server-side).
7. **First-run branding** — during provisioning (packages/db/provisioning.ts)
   copy a tasteful default theme into `tenants.theme` (derive from the
   existing branding editor's schema — read BrandingClient to match keys),
   so new sites don't render unthemed.
8. **STRETCH (branch only): apps/web move** — follow the checklist + coupling
   audit in `docs/scalability/monorepo-foundation.md` on branch
   `codex/web-move`. Full verification on the branch; do NOT merge or touch
   the production Vercel config; leave a merge checklist in the handoff.

## Definition of each item done

Code + tests green + deployed (except branch-only work) + handoff updated +
Jira annotated. End the run with a summary: items completed, commits, what
remains, and anything the user must do (e.g. DeepSeek top-up).
