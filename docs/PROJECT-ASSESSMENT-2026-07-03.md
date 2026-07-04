# LUME — Project Assessment (2026-07-03)

_Claude's notes after reviewing `docs/SESSION-HANDOFF.md`, `CLAUDE.md`,
`docs/vision/product-vision.md`, the migration history, and the repo state
on `main` @ `3f99748`. Opinionated; treat as input, not gospel._

## Verdict in one paragraph

The project is in unusually good shape for its stage. The hard,
hard-to-retrofit decision — multi-tenancy with RLS at every layer — was made
early and executed consistently, the verification baseline is real (clean
typecheck, 111 tests, both builds green, migrations through 023 applied with
advisors checked), and the session/handoff discipline is better than most
professional teams manage. The main risks are not quality but **sequencing**:
a growing pile of built-but-dormant capability (the bot brain, loyalty
schema, admin surfaces breadth-first), a public app that keeps growing at the
repo root while its migration to `apps/web/` keeps deferring, and
multi-tenancy that has never been exercised with a second tenant.

## What's genuinely strong

1. **Tenant isolation is done right, everywhere.** `tenant_id` + RLS +
   defense-in-depth `.eq("tenant_id", …)`, anon read scoped to `active`
   tenants, service-role confined to trusted routes. This is the part that
   kills multi-tenant products when retrofitted; here it's foundational.
2. **Operational discipline.** Migrations are sequential and applied with
   `list_tables` before / `get_advisors` after; no schema drift between
   files and prod. The verification baseline is checked before every merge.
3. **Risk-aware product decisions.** Per-viewer preview mode
   (`?preview=lume`) instead of flipping `VITE_PAGE_RENDERER` globally is
   exactly the right call: it lets the DB-driven renderer be validated in
   prod with zero blast radius for real visitors.
4. **The parallel-agent workflow works.** Claude + Codex on disjoint file
   lanes, with a mechanical shared-file check before merge, verification on
   the integration branch, and a single actor (Claude) owning
   migrations/deploys. This is a real process, not vibes.
5. **Package seams are correct.** `@lume/types` / `db` / `rag` / `blocks` /
   `bot` are the right boundaries for the eventual `apps/web` move; new code
   depending on workspace packages instead of root-relative paths is the
   cheapest possible insurance for that migration.
6. **The handoff doc itself is a model of the genre** — live state,
   verification baseline, guardrails, and key locations in ~110 lines.

## What worries me (ranked)

1. **The bot is the product's differentiator and it's dormant.**
   `@lume/bot` is merged, tested in isolation, and imported by nothing. The
   vision says "the bot is a real actor in the UI"; today it's a library
   with a README. Until SCRUM-144 wires it into `/api/chat`, every week of
   other work widens the gap between the pitch and the product. Agreed with
   the handoff: this is the single highest-value next step.
2. **Multi-tenancy has never met a second tenant.** One tenant (`default`)
   exists. RLS policies, tenant resolution, per-tenant theming, domains —
   all plausibly correct, none proven under an actual second tenant. Before
   any real customer conversation, create a second tenant end-to-end
   (seed → theme → pages → chat) and watch what breaks. This is also the
   only honest test of the onboarding/provisioning story, which currently
   doesn't exist.
3. **Two `/api/chat` endpoints in prod** (root `api/chat.ts` + the admin
   route). Duplicated public attack surface + guaranteed behavioral drift
   once the bot wiring lands in one of them. SCRUM-119 is deferred for good
   reason (risky to delete), but it should be scheduled, not parked —
   ideally consolidated *as part of* the SCRUM-144 wiring so the bot only
   ever has to be integrated once. Same bucket: SCRUM-115 (DeepSeek key
   rotation) is security debt with a known fix; cheap to just do.
4. **Schema is running ahead of product.** Loyalty tables (mig 022) with no
   UI or engine; six admin surfaces landed in one Codex batch; `tenant_domains`
   UI without (as far as the docs show) actual domain routing. Breadth-first
   scaffolding is fine, but each dormant surface is a maintenance liability
   and a false signal of completeness. I'd freeze new surfaces until the bot
   wiring and preview verification land.
5. **The `apps/web` move gets more expensive every week.** 286 TS/TSX files
   in `src/` vs 63 in the admin app, and the Vite app still lives at the
   repo root. The migration checklist exists
   (`docs/scalability/monorepo-foundation.md`); the longer it defers, the
   more root-relative references accrete. Doesn't need to happen now, but it
   needs a trigger condition (e.g. "before the second tenant" or "before
   custom domains go live"), not an open-ended "eventually".
6. **Admin app has no tests.** `npm test` covers the Vite app only, while
   the admin app is where money-touching logic (leads, team roles, invites,
   domains) now lives and is growing fastest. Even a thin layer over the
   role/invite logic would pay for itself.
7. **Small rot, cheap fixes:** `as any` casts in admin clients because
   `packages/db/src/schema.ts` lags migrations 012/020/022/023 — one sitting
   of typing work removes them and prevents the pattern from spreading.
   ~28 branches (many stale) + two leftover Codex worktrees. Jira board no
   longer reflects reality (workflow limitation acknowledged, but it means
   the board can't be trusted for planning). `docs/` contains a dozen plan
   files of unknown staleness next to the two authoritative ones — worth a
   one-line "superseded by X" header on the dead ones.

## Suggested order of operations

1. Verify preview mode end-to-end on prod (already open item #1 — minutes).
2. SCRUM-144: wire `@lume/bot` into chat, and fold SCRUM-119 (endpoint
   consolidation) into the same effort so wiring happens exactly once.
   Rotate the DeepSeek key (SCRUM-115) while touching that code.
3. Add missing tables to the `Database` type; delete the `as any` casts.
4. Create a real second tenant and walk the full lifecycle; write down every
   thing that required manual SQL — that list *is* the onboarding backlog.
5. Branch/worktree cleanup (already offered; mechanical).
6. Set a trigger condition for the `apps/web` move and start adding admin
   tests alongside whatever is touched next.

## On the handoff doc itself

Keep doing exactly this. Two tiny suggestions: date the "what was built"
subsections (they'll blur across sessions), and when an item is deferred,
record the *condition* under which it becomes urgent (e.g. SCRUM-119 becomes
urgent the moment bot wiring starts) so deferrals age visibly instead of
silently.
