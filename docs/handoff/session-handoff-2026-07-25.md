# Session handoff — 2026-07-25

Start a new session with this file open instead of the full transcript. It's
current as of the end of the 2026-07-24/25 session. Older handoff docs in
this directory (`session-context.md`, `concierge-autonomous-testing.md`,
`prod-vs-local-findings.md`) predate this one — check dates before trusting
them over this file.

## Repo/worktree layout in play

- `~/Documents/LUME` — main checkout. Currently on `codex/managed-sftp-feed-transport`
  (Codex's branch), working tree clean except pre-existing untracked scratch
  files (`.mcp.json`, `docs/staging/`, `test-results/`, a few stray docs —
  none of these are session deliverables, leave them alone).
- `~/Documents/LUME-upcoming` — integration checkout, branch
  `integrate/feed-sync-plus-grid`. This is the ONLY place that pushes to
  `origin/features/upcoming`. The flow every time: commit on the source
  branch → cherry-pick onto this branch → re-gate (typecheck, vitest, both
  builds, `git diff --check`) → push. Never push directly from another
  checkout.
- Several other stale worktrees exist (`LUME-customer-history`,
  `LUME-deepseekHERMES`, `LUME-main`, `LUME-staging-prod-clone`,
  `LUME-template-experience`, `LUME-template-foundation`) — not touched this
  session, ignore unless asked.

## What's live on `origin/features/upcoming` (all pushed, all gated)

In landing order, newest last:
1. Concierge deterministic-layer fixes (6 bugs from live-reproduced testing)
2. Selection-leak-on-reset fix
3. Dealer launch readiness engine + closed security debt SD-001/002/003
   (SSRF/DNS-rebinding, IPv4-mapped-IPv6, unbounded body — all fixed in
   `remoteImageFetch.ts`)
4. Long-conversation state-drift fix (stale scope after many turns)
5. Blank-reply + stale-budget-leak fix
6. Tenant-deletion trigger FK-violation fix (migration 076)
7. VehicleFilters toolbar/drawer consolidation (shared between VehiclesPage
   and the page-builder block)
8. VDP made page-builder customizable (Phase 1)
9. `service-booking` block for Service & Parts (Phase 2)
10. 8 Tier-1 dealer page templates: financing, trade-in, specials, service,
    about, reviews, faq, privacy (Phase 3) — seeded onto the `demo` tenant
    already via `scripts/seed-default-pages.ts`
11. Managed inbound inventory feeds + outbound syndication infrastructure
    (migration 077) — HTTPS + tenant-storage sources, CSV/JSON/XML,
    non-destructive VIN/stock-first sync, durable queue/retry/dead-letter
12. Host-verified SFTP feed transport (migration 078) — admin-supplied
    SHA-256 host-key fingerprint, DNS-pinned, `ssh2` dependency
13. Fix for a real bug found on first live use: `claim_inventory_feed_runs`
    had an ambiguous `tenant_id` (PL/pgSQL OUT-parameter vs table column)
    that made every claim fail (migration 079)

## Prod database state

Migrations 076–079 are **applied to prod** (project `atsgdjwjtmqvtotbrowu`),
verified via `list_migrations` + `get_advisors` (clean — no anon-executable
RPCs, only the expected "RLS enabled, no policy" INFO notices on the
intentionally deny-all credential tables).

Two new secrets are live in `apps/admin/.env.local` (gitignored, not
committed): `CRON_SECRET` and `INVENTORY_INTEGRATION_ENCRYPTION_KEY`.

**A real SFTP source is configured and working** on the `demo` tenant
(source name "glo3d", host `sftp.glo3d.net:2222`, user `drivegood`) —
last confirmed run: **193/193 vehicles created successfully**, zero
conflicts. Mapping was corrected once already (real CSV headers are
lowercase/camelCase — `vin`, `stockNumber`, `photos`, etc. — not the
placeholder `VIN`/`Stock`/`SellingPrice` originally guessed). Three vehicles
in that feed have implausibly low prices ($98/$113/$139) — **confirmed via
the raw CSV that this is bad supplier data, not a LUME bug** — worth a
price-sanity-check guard as a future small task, not yet built.

Locally, nothing auto-triggers the feed/export cron workers (Vercel's
schedule doesn't run under `next dev`) — trigger manually with:
```
source apps/admin/.env.local
curl -s -X GET http://localhost:3100/api/cron/inventory-feed-runs \
  -H "Authorization: Bearer $CRON_SECRET"
```

## In-flight / not yet reviewed

- Codex is on `codex/managed-sftp-feed-transport`, currently working on the
  founder's own **inbound/outbound repos** (`/Users/younesshaki/Documents/GitHub/inbound`
  and `.../outbound`) per an earlier task — extract-and-adapt into LUME
  (these are the founder's own prior work, not a third party's — no IP
  concern). Not yet reported back at time of writing.
- Kimi's task queue is currently empty (finished VDP + dealer pages, fully
  reviewed and shipped, see above).

## Established review process for any new agent work

1. Read the diff/commit fully before trusting a "done" report — every prior
   review this session found something (a missing detail, a discrepancy, or
   in one case a live bug) that the report alone didn't surface.
2. Independently re-run: `npm run typecheck:all`, `VITE_LUME_TENANT=default npx vitest run`,
   `npm run build && npm run build:admin`, `git diff --check`.
3. For anything security-sensitive (RLS, credential handling, SSRF-prone
   fetches), verify claims by reading the actual code paths, not just the
   summary — this repo now has a real security debt register
   (`docs/security/security-debt.md`) and a launch-readiness engine; keep
   both honest.
4. For migrations: `list_tables` before, `apply_migration`, then
   `list_migrations` + `get_advisors` after. Treat every `apply_migration`
   as live-on-prod (it is — no separate dev branch by default).
5. Land flow: commit on the source branch → cherry-pick onto
   `~/Documents/LUME-upcoming` (`integrate/feed-sync-plus-grid`) → re-gate
   → push to `origin/features/upcoming`. Watch for cherry-pick conflicts
   when a branch has diverged (handle manually, don't blind-resolve).

## Business/product context from this session (not code, but relevant)

- Founder has 6 years inside a DMS across every department — real domain
  expertise, not outside-in guessing.
- Positioning: not competing head-on with legacy DMS incumbents (CDK,
  Reynolds & Reynolds) — LUME is a layer that can start as an add-on and
  grow into a full replacement for dealers who want it. The AI concierge
  (deterministic-first, unusually reliable vs. competitors' bolt-on chat
  widgets) is the sharpest differentiator, paired with the website quality.
- Zero paying customers so far. Founder has 1,000+ warm industry contacts.
  Go-to-market discussion landed on: realistic first-wave conversion 3–8%
  (30–80 customers), $300–700/mo pricing → $108K–$672K/yr first-wave
  revenue range. 5-year range discussed: $600K–$4.2M/yr depending on
  whether repeatable acquisition beyond the initial network is ever solved
  (the single biggest real risk — not product quality, not competition).
- Recommendation given and still open: get one real design partner from the
  network looking at LUME *now*, not after it's "finished" — perfectionism/
  scope-creep is a named, observed pattern this session (continuous
  engineering, no go-to-market motion yet).
- Voice-input for the concierge was discussed and deliberately deprioritized
  — real UX fit (hands-free while browsing) but real risk (speech-to-text
  errors on exactly the VINs/trims/ordinals the concierge's reliability
  depends on) and real opportunity cost pre-first-customer. Revisit once
  there are paying customers asking for it, not before.
- Inbound SFTP **push** server (LUME hosting its own SFTP endpoint suppliers
  push to, vs. the pull-based client just shipped) is written up as a future
  discussion, not scoped: `docs/architecture/inbound-sftp-push-server-2026-07-24.md`.
  Recommendation there: self-host (~$5-20/mo) over AWS Transfer Family
  (~$215/mo fixed) at current scale.

## Key docs to load if picking a specific thread back up

- `docs/architecture/managed-inventory-feeds-and-syndication-2026-07-24.md` —
  full design for the feed/export system.
- `docs/architecture/inbound-sftp-push-server-2026-07-24.md` — the deferred
  push-server idea.
- `docs/security/security-debt.md` — live register, check before any
  go-to-market gate.
- `CLAUDE.md` — repo conventions, unchanged this session, still authoritative.
