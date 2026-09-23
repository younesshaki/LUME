# Public Concierge Latency — Benchmark and Changes

- **Date:** 2026-09-23
- **Branch:** `perf/website-concierge-latency` (from `origin/main` @ `7982b73`)
- **Scope:** speed only. No change to what the concierge decides, filters,
  opens or is allowed to do. Correctness is owned by the parallel Codex lane.

## 1. How it was measured

**Server:** `apps/admin/bench/concierge-latency.bench.ts` drives the real
`/api/chat` handler in-process against the production-backed Supabase project
(the only credentials that exist locally) and records every upstream call:
start time, headers, body end.

This is safe to run against production because a fetch guard rejects anything
that isn't a read: PostgREST `GET`/`HEAD`, or a `POST` to one of three
`STABLE` RPCs. The run fails if anything else is attempted, and every run
reported below recorded zero blocked writes. The per-turn quota reservation is
itself a write, so its latency is modelled instead: one real read of the
operational subscription, plus one read-only RPC round trip standing in for
the reservation. That is the same two dependent round trips production makes.
`after()` work is dropped and conversation memory stays in-process.

```bash
LUME_BENCH_ENV_FILE=/abs/path/apps/admin/.env.local \
LUME_BENCH_ITERATIONS=20 LUME_BENCH_MODEL_ITERATIONS=6 \
LUME_BENCH_OUT=/tmp/concierge-bench.json \
npx vitest run --config apps/admin/bench/vitest.config.mts
```

Tenant `default` (1,009 live vehicles). The first journey of each run is cold
and reported separately; the percentiles use the warm journeys (n = 14 before,
19 after).

**Where the numbers come from.** The benchmark ran on a Mac, reaching
Supabase in eu-west-1 at about 80–95 ms per round trip. Production functions
run in **iad1 (Washington, DC)**: every response header from
`lume-admin-five.vercel.app` carries `x-vercel-id: cdg1::iad1::…`. So
production also crosses the Atlantic on every database call, and its round
trip is similar. The absolute numbers are indicative. The count of serial
round trips transfers exactly.

**Browser:** `e2e/concierge/action-latency.spec.ts` runs against a production
build (`vite build` + `vite preview`) with every backend stubbed. It times
from the chat response arriving to the destination page being mounted and
requesting its data. It runs twice: unthrottled, and on a mobile-like profile
(`CONCIERGE_NETWORK=4g`: 100 ms latency, 9 Mbps).

## 2. Bottlenecks found

| # | Bottleneck | Layer | Evidence |
|---|---|---|---|
| 1 | Admin functions run in iad1 while the database is in eu-west-1, so every round trip crosses the Atlantic | Network / infrastructure | `x-vercel-id … iad1`. Supabase `atsgdjwjtmqvtotbrowu` is eu-west-1 |
| 2 | A deterministic turn chained **6 dependent round trips**: tenant → quota (2) → config → facets → inventory query | API orchestration | Baseline timeline: 6 waves, 8 calls, p50 525 ms |
| 3 | Destination route code (inventory, vehicle detail) was downloaded only after the action arrived | Browser / UI | 4G profile: action → mounted page took 280 ms (inventory) and 760 ms (detail) |
| 4 | Model path: image descriptions and the inventory count were read after the knowledge reads, not alongside them | API orchestration | Code inspection; they now share one round trip |
| 5 | The database itself is **not** a bottleneck | Database | `EXPLAIN ANALYZE`: inventory query 1.05 ms using `vehicles_tenant_price_idx`; `vehicle_facets_v2` 10.2 ms |
| 6 | Model time to first text includes a whole non-streamed first call | Model / provider | `route.ts` phase 1 is `stream: false`. Not measurable locally, see §6 |

Telemetry was already off the response path: trace and PostHog writes run in
`after()`, and `recordConciergeTurn` is a synchronous log line that can't
throw. Browser submit → request took **0.2–0.5 ms**, and the user bubble and
pending state render in the same tick, so nothing needed changing there.

## 3. Results

Server, production-shaped (quota included), p50 / p95 in ms:

| Stage | Before | After |
|---|---|---|
| 2. API entry → facet vocabulary ready | 431 / 485 | **95 / 102** |
| 2. API entry → state resolved (inventory query starts) | 439 / 493 | **188 / 273** |
| 3. Inventory query start → grounded result | 88 / 103 | 85 / 110 *(one round trip; ~1 ms is database time)* |
| 4. API entry → first SSE byte | 526 / 591 | **275 / 385** |
| 5. API entry → first safe action event | 526 / 591 | **276 / 385** |
| 7. Full deterministic turn (`[DONE]`) | 526 / 591 | **276 / 385** |
| Serial round-trip waves | 6 | **2–3** |
| Upstream calls per turn | 8 | 7 |
| 8. Model path: API entry → model request sent | 545 / 612 | **286 / 307** |

Rows 4, 5 and 7 are equal because a deterministic turn is sent as a single
chunk. Per canonical step, the after-change p50 is 263–275 ms and p95 is
276–385 ms. The higher p95 on the first step is one slow sample.

Browser (production build), action → destination mounted, in ms:

| Profile | Inventory, before → after | Vehicle detail, before → after |
|---|---|---|
| Unthrottled | 28–30 → **10–14** | 29–38 → **7–13** |
| 4G-like | 278–305 → **10–11** | 760–764 → **9–20** |

Stage 1 (browser submit → request begins) is 0.2–0.5 ms, before and after.

**Targets.** The browser target (under 250 ms to apply an action) is now met
with a wide margin. The server target (under 750 ms p95 for a deterministic
turn) was already met, and the gain is about 50%. The remaining server time is
two or three transatlantic round trips; §6 item 1 is the change that removes
most of what's left.

## 4. Changes, and why each is safe

**`perf(concierge): overlap independent reads on the public chat path`**
(`apps/admin/app/api/chat/route.ts`, `apps/admin/lib/tenant.ts`)

- **Tenant-only reads now start together:** the facet RPC, the tenant
  config reads (persona, runtime config, visitor, targets, plan) and the
  quota check. Each read is wrapped with `settle()` and re-thrown by
  `unwrapSettled()` at the exact point the old code awaited it. So:
  - A quota refusal still returns 429 before any read result is used.
  - A failed facet read still lands in the same `state-build` 500.
  - No early rejection goes unhandled.

  These reads have no side effects. On a refused or duplicate turn their
  results are thrown away, which costs one small read each.
- **Early vehicle read.** When the visitor is on a vehicle page and didn't ask
  to reset scope, that vehicle's row is read in the first wave. That page
  always wins the candidate order, and the early result is reused only when
  the resolved candidate is that exact id.
- **Tenant lookup cache.** The slug → active-tenant lookup is cached for 30 s
  per exact slug, and only on `/api/chat`. Unknown, inactive and failed
  lookups are never cached, and concurrent misses share one lookup. The
  cached value is the lookup's own row, so one slug can't return another
  tenant. Trade-off: a tenant suspended in the last 30 s can still get chat
  answers on a warm instance. The plan cache already accepts 5 minutes for a
  comparable change.
- **Model context in one round trip.** Image descriptions and the inventory
  count now load together with the knowledge, loyalty and preference reads.
  The chunk order stays the same: retrieved chunks, then the open vehicle,
  then image descriptions.

**`perf(concierge): warm destination route code when the assistant opens`**
(`src/app-shell/routeModules.ts`, `src/components/chat/OllamaChat.tsx`)

- Opening the assistant preloads the code for the inventory and vehicle
  detail pages. It never loads data: no inventory request is made, and a bot
  navigation still fetches results only after the destination has applied
  the filter. Cost: about 410 KB raw (~110 KB gzipped), once per session,
  from hashed, cacheable assets.
- No action timing or authority changed. The turn sequencer is untouched, and
  the stale, superseded, aborted and duplicate browser suite still passes
  (7/7).

## 5. Proof the buyer journey is unchanged

Every benchmark journey asserts the canonical sequence. It passed on all 15
journeys before the change and all 20 after:

1. "Do you have any Ferraris?" → `filter_inventory` with `make: "Ferrari"`
   and **no** `model`.
2. "cars for more than 100k" → `priceMin: 100000`, and the Ferrari make is
   **cleared**.
3. "10 most expensive cars" → exactly `sort: "price_desc", limit: 10`, and 10
   rows come back.
4. "open the second one" → `navigate-target` whose `vehicleId` is the
   **second id** of step 3's stored result set.

Every action payload (minus the per-session attribution id), every reply text
and every result-id list was fingerprinted before and after. The set of
distinct outcomes for each step is **identical**. The model scenario confirmed
the fallback path still assembles context and reaches the provider.

Gates: see the handoff report.

## 6. Deferred — needs an owner decision

1. **Move the admin (and public) functions next to the database.** This is
   the biggest remaining gain. Setting the function region to `dub1`
   (Dublin, next to eu-west-1) turns each round trip from about 80 ms into a
   few ms. The critical path is now 2–3 round trips, so a deterministic turn
   would drop from about 275 ms to well under 100 ms of server time. It's a
   production project setting (`regions` in `apps/admin/vercel.json`, or the
   dashboard). It also moves execution away from US visitors, but the edge
   (`cdg1`) is already in Europe for current traffic. Owner: infrastructure.
2. **Make quota one round trip.** Quota is now the longest leg of the first
   wave: an uncached subscription read, then the reservation RPC. There are
   two options:
   - Fold the subscription lookup into the reservation RPC. This needs a
     migration.
   - Cache the operational subscription for a short time. This changes how
     fast a billing change takes effect.

   Either saves about one round trip (~85 ms here). Billing semantics are out
   of scope for this lane.
3. **Stream the first model call.** Model time to first text includes a
   whole non-streamed tool-deciding call. Streaming it would change how tool
   calls are parsed. That's a provider and behaviour change, and it can't be
   measured locally: the DeepSeek key returns `402 Insufficient Balance`, and
   there's no AI Gateway key locally.
4. **Upstash for shared memory.** It's still not provisioned. When it is,
   memory reads and writes become network round trips. Put its region in
   eu-west-1 too, and re-run this benchmark: memory commits sit before
   `[DONE]` on purpose (compare-and-swap ordering).
5. **Signed-in visitor preference write before `[DONE]`.** It delays the
   end-of-turn signal for signed-in visitors. Moving it after `[DONE]` could
   race the next turn's preference read. Left as is.
6. **Sort tie-break (hand to Codex; correctness).** No `applySort` order has
   a unique final key (`packages/db/src/vehicleQuery.ts`). Bulk-imported
   vehicles share `created_at`, and equal prices tie. Identical queries
   returned different orders in both runs: "cars for more than 100k" gave two
   distinct id orders (12 vs 3 in the baseline). The concierge's stored "the
   second one" is self-consistent, but the inventory page re-queries and can
   show a different second card. Proposed fix: add `.order("id")` as the
   final key. It changes result order, so it belongs in the correctness lane.

## 7. Files likely to overlap with the correctness lane

- `apps/admin/app/api/chat/route.ts`:
  - The setup block from tenant resolution through `unwrapSettled(tenantConfigRead)`.
  - The `Promise.all` that awaits the selected vehicle and the facets.
  - The model-context `Promise.all` in the `assembled` try block.

  No action, state or interpretation branch was edited.
- `apps/admin/lib/tenant.ts`: new cached functions added; the existing ones
  are unchanged.
- `src/components/chat/OllamaChat.tsx`: one import, and one call in the
  launcher's `onClick`.
- `src/app-shell/routeModules.ts`: one new exported function.
- New files, so no overlap: `apps/admin/lib/settled.ts`,
  `apps/admin/lib/chatRoutePerformance.test.ts`,
  `src/app-shell/routeModules.preload.test.ts`,
  `e2e/concierge/action-latency.spec.ts`, `apps/admin/bench/*`.
