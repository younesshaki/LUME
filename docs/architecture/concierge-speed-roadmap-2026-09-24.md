# Concierge Speed Roadmap

- **Date:** 2026-09-24
- **Status:** backlog. Nothing here is started unless noted.
- **Goal:** the fastest dealership concierge on the market: near-instant answers
  to rules-based (deterministic) questions, and page changes that feel instant.
- **Related:**
  - [concierge-latency-benchmark-2026-09-23.md](concierge-latency-benchmark-2026-09-23.md)
    (branch `perf/website-concierge-latency`; the measurements behind items 1–3)
  - [concierge-speed-telemetry.md](concierge-speed-telemetry.md) (how each
    item is measured)

## Where we stand

The concierge is **not yet fully optimised**. The architecture is sound
(deterministic-first, grounded actions, stale-turn protection). The remaining
time is mostly structural.

Two pieces of work are **built but not merged**:

| Branch | What it does | State |
|---|---|---|
| `perf/website-concierge-latency` | Overlaps independent database reads, caches the tenant lookup, and preloads the inventory and vehicle page code when the chat opens | Reviewed, gates green, not merged |
| `feat/concierge-speed-telemetry` | Per-turn speed data for every interaction and conversation, plus a PostHog dashboard | Gates green, not merged. Exists as `~/LUME-concierge-speed-telemetry.bundle` until imported |

Until both ship, production runs the slower path, and there is no real-visitor
speed data. The numbers below are from a local, read-only benchmark: a machine
reaching the Ireland database, a distance similar to production's.

| Measure (deterministic turn) | Production today | With the speed branch |
|---|---|---|
| Request → answer and action sent (median / p95) | ~525 / 595 ms | ~365 / 440 ms |
| Database calls waited on in sequence | 6 | 4 |
| Action → inventory page visible (4G-like network) | ~280 ms | ~11 ms |
| Action → vehicle page visible (4G-like network) | ~760 ms | ~10 ms |

Database time is **not** the bottleneck: the inventory query takes about
1 ms and the facets RPC about 10 ms. The time is spent travelling to the
database and waiting on calls in sequence.

## Backlog, by expected impact

Each item names how the speed telemetry will prove it worked.

### 1. Move the functions next to the database
- **Problem:** the admin (chat) functions run in **iad1 (Washington)**, while
  Supabase is in **eu-west-1 (Ireland)**. Every database call crosses the
  Atlantic, at about 80–90 ms each.
- **Change:** set the function region to `dub1` for both Vercel projects:
  `lume-admin` for the chat, and `lume` for the public site's `/api/*`.
- **Expected:** each database call drops to a few ms, and a deterministic turn
  to well under 100 ms of server time.
- **Effort / risk:** a settings change, no code. It moves execution away from US
  visitors, but the traffic edge is already in Europe (`cdg1`).
- **Owner:** infrastructure. Production configuration, so it needs owner
  approval.
- **Measure:** `server_first_byte_ms` median and p95, compared by `region`.

### 2. Merge the speed branch
- **Change:** merge `perf/website-concierge-latency`, and resolve its overlap
  with the telemetry branch in `apps/admin/app/api/chat/route.ts`. Merging the
  speed branch first is simplest.
- **Expected:** see the table above.
- **Measure:** `server_first_byte_ms`, `action_route_ms`, `action_ready_ms`.

### 3. Make the quota check one database call instead of two
- **Problem:** every turn waits for an uncached subscription read and then the
  usage-reservation RPC, one after the other, before anything else can start.
- **Change:** fold the subscription lookup into the reservation RPC. This needs
  a migration. The alternative is a short-lived subscription cache, but that
  changes how fast billing changes apply.
- **Expected:** about 85 ms saved on every turn, whether refused or approved.
- **Measure:** `server_quota_ms` minus `server_tenant_ms`.

### 4. Remove the extra server hop on the public site
- **Problem:** the public site's `/api/chat` is its own Vercel function that
  proxies to the admin app. That adds a second function invocation, and a
  second possible cold start, to every message.
- **Change:** replace the function with a Vercel rewrite, or call the admin app
  directly. It already supports CORS for the public origin.
- **Measure:** `client_network_overhead_ms`. This is exactly the time the
  telemetry attributes to network, proxy and cold start.

### 5. Stream the first model call
- **Problem:** on model-backed turns, the first call (which decides whether to
  use tools) isn't streamed. The visitor sees nothing until it has fully
  finished.
- **Change:** stream phase 1, and handle tool-call deltas while streaming.
- **Expected:** seconds off time to first words on model turns.
- **Risk:** changes how tool calls are parsed, and is provider-specific, so it
  needs careful tests.
- **Measure:** `client_first_text_painted_ms` where `server_route` is `model` or
  `tool`, and `server_model_phase1_ms`.

### 6. Check what the model router costs on rules-based turns
- **Problem:** the provider-backed semantic router may call a model before
  answering when the rules find no inventory intent. Its frequency and duration
  haven't been measured yet.
- **Change, if it turns out frequent or slow:**
  - a faster or smaller interpreter model;
  - a stricter trigger;
  - a cache for common phrasings.
- **Measure:** how often `server_interpretation_ms` is present, and its median
  and p95. Compare `route = interpreted` with `route = deterministic`.

### 7. Send the first results with the filter action
- **Problem:** the server already holds the grounded result set when it sends a
  filter action, but the inventory page fetches the same results again after
  navigating.
- **Change:** include the first page of results with the action, and render
  them immediately.
- **Expected:** the inventory appears essentially instantly after an action.
- **Prerequisite:** fix the sort tie-break first. No sort currently has a
  unique final key, so the same query can return tied cars in a different
  order. Otherwise the chat's "the second one" and the page's second card could
  differ. That fix belongs to the correctness lane.
- **Measure:** `action_ready_ms − action_route_ms` for `filter_inventory`.

### 8. Measure cold starts, and act if they're frequent
- **Problem:** at low traffic, a noticeable share of turns may land on a cold
  instance.
- **Change, if the data shows it:** keep-warm, a scheduled ping, or checking
  the bundle size of the chat function.
- **Measure:** `server_first_byte_ms` by `cold_start`, and the share of
  `cold_start = true`.

### 9. Keep shared memory next to the database
- **Context:** Upstash (shared conversation memory) isn't provisioned. When it
  is, memory reads and writes become network calls on every turn.
- **Change:** provision it in eu-west-1, beside Supabase and the functions.
- **Measure:** `server_memory_ms − server_config_ms` and `server_memory_commit_ms`.

## Suggested order

1. Import and merge the telemetry branch, merge the speed branch, and deploy.
2. Move both Vercel projects to `dub1` (item 1).
3. Collect a few days of real data on the **"LUME Concierge — Speed"**
   dashboard (`npm run posthog:speed-dashboard -- --apply`).
4. Work through items 3–9 in the order the data shows. The server stage
   breakdown and `client_network_overhead_ms` identify the largest remaining
   cost.
5. After each deploy, compare time to first words for the new release against
   the previous one.

## Target end state

- **Deterministic answers:** first words visible in well under 150 ms on a good
  connection, and under 300 ms at p95.
- **Actions:** the destination page painted with its data in under 250 ms after
  the action arrives.
- **Model answers:** can't be instant. The goal is first words in well under a
  second at the median, and a p95 that stays within a few seconds.
