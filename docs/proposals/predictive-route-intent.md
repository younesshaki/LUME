# Proposal: Predictive Route Intent (experimental)

Status: **proposal only — not implemented.** Do not build this until the
baseline performance work (route-scoped prefetch, facets endpoint, lazy audio)
has shipped and been measured in production. This document describes a possible
*next* step, its guardrails, and how we would prove it helps before trusting it.

## Motivation

After the PR2/PR3 work, a public route loads its own bundle and idle-prefetches
a small, fixed set of "likely-next" routes. That set is static — it does not
know where *this* visitor is actually heading. "Predictive Route Intent" would
make prefetching reactive: watch the pointer's trajectory toward navigation
targets and, only when confidence is high, prefetch the specific route the user
is about to click — a little earlier than a hover-prefetch would.

This is a refinement, not a replacement. Hover/focus/pointer-down prefetch (the
baseline) already captures most of the win at near-zero risk. Predictive intent
is worth it only if measurement shows a meaningful gap between "pointer starts
moving toward a link" and "pointer-down," and only if we can spend that gap
without wasting bandwidth.

## Design sketch

### Signals
- **Pointer trajectory:** sample `pointermove` (throttled to animation frames),
  keep a short ring buffer of `{x, y, t}`, derive velocity and heading.
- **Target geometry:** for each visible nav target (header links, dock items,
  vehicle cards), cache its rect (via `IntersectionObserver` + a resize/scroll
  invalidation), and compute the angle from the pointer to the target center
  and the time-to-arrival at current velocity.
- **Confidence score** per target, combining: heading alignment (dot product of
  velocity and pointer→target vector), closing speed, distance, and dwell.
  A target crosses threshold only when alignment is high *and* time-to-arrival
  is within a small window (e.g. 80–250 ms).

### Staged preloading
Confidence is not binary — stage the work so a wrong guess is cheap:
1. **Warm (low confidence):** `import()` the route's JS chunk only.
2. **Prime (medium):** additionally warm the route's first data call behind a
   short-lived cache (e.g. the facets endpoint, or `loadVehicleById` for a card).
3. **Commit (high, pointer slowing over target):** allow the data fetch to run.

Never stage past what the current confidence justifies, and cancel/forget a
target the moment the pointer's heading diverges.

### Budget & guardrails (non-negotiable)
- **Respect the user:** disabled entirely under `navigator.connection.saveData`,
  `effectiveType` of `2g/3g`, and `prefers-reduced-motion` is irrelevant here but
  `prefers-reduced-data` (where supported) disables it.
- **Coarse pointers:** touch devices have no useful trajectory — gate on
  `matchMedia("(pointer: fine)")`. Fall back to the existing hover/tap prefetch.
- **Concurrency cap:** at most one in-flight predictive prefetch; a global
  per-session cap on predictive bytes; deduplicate against already-loaded chunks.
- **Idle-only data:** the "commit" data stage runs only via `requestIdleCallback`
  so it never contends with the current route's own work.
- **No behavioral coupling:** prediction may only *prefetch*; it must never
  navigate, mutate state, fire analytics as if the user acted, or meter usage.
  (Note: the vehicle APIs meter `vehicle_requests` — predictive data fetches
  would inflate usage/quota, so the "commit" stage must be **cache-warming only**
  and must not hit metered endpoints unless we add an explicit unmetered warm path.)
- **Tenant safety:** unchanged — all prefetches go through the same tenant-scoped
  endpoints and RLS.

## How we would prove it (before trusting it)
1. Ship baseline (done) and record production numbers: TTFB/first-paint of the
   next route after a hover-prefetch, and the distribution of "hover→click" gaps.
2. Add the predictor behind a flag in **shadow mode**: compute confidence and log
   predicted-vs-actual next route, but do **not** prefetch. Measure precision
   (how often the top prediction matches the click) and lead time.
3. Only if precision is high (say ≥70% at ≥100 ms median lead) and the wasted-
   bytes estimate is small, enable staged prefetch behind the flag for a cohort,
   and compare next-route interaction latency and bounce against control.
4. Keep the kill switch: a single flag disables prediction and reverts to the
   baseline hover/idle prefetch with zero code removal.

## Why not now
- The baseline already removes the pathological cost (whole-app + whole-catalog
  on every visit). Predictive intent optimizes the *margin*, and margins should
  be measured before they are engineered.
- The usage-metering coupling is a real footgun: naive predictive data fetches
  would burn tenant `vehicle_requests` quota for pages never viewed. That needs
  an unmetered warm path designed first.
- Trajectory heuristics are easy to get subtly wrong (jitter, fast flicks,
  trackpad vs mouse). Shadow-mode measurement is mandatory, not optional.

## Rough size / rollout
- ~1 small module (`predictRouteIntent`) + a provider that wires pointer + rects,
  behind `VITE_PREDICTIVE_ROUTE_INTENT` (default off).
- Phase 1 shadow-mode logging: ~1 day. Phase 2 staged prefetch: ~1–2 days.
- No schema, no server changes for shadow mode. An unmetered warm endpoint (if we
  reach the data-commit stage) is a separate, later change.
