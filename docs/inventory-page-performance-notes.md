# Inventory page performance — investigation notes (2026-07-13)

Captured from a network trace of `/vehicles` (tenant `demo`): **152 requests,
27.4 MB transferred, DOMContentLoaded 338ms, Load 5.81s, network-finish
34.54s.** DOMContentLoaded is fast — the shell mounts quickly. The long tail
is JS, audio, and Supabase calls piling up after that.

Not yet actioned. Revisit this file before starting a performance pass on
`/vehicles`. Say "create the performance PR" to have Claude implement these
on a separate branch (not `main`).

## 1. Full inventory downloaded sequentially (biggest issue)

`loadVehiclesFromApi()` in `src/experience/vehicles/catalog.ts` runs a
`while (hasMore)` loop against `/api/vehicles?tenant=demo&limit=200&offset=N`,
awaiting each page before requesting the next. For `demo` (1172 vehicles)
that's 6 sequential round trips before the catalog is even usable client-side.

**Fix:** page the UI itself (24–40 vehicles first paint), fetch more on
scroll/pagination. Move filter dropdown values (makes/models/states/cities)
to their own small cached endpoint instead of deriving them from the full
downloaded catalog.

## 2. Each `/api/vehicles` batch does too much work server-side

Per request: `tenant_by_slug` RPC, an awaited usage-metering RPC (when
service-role client exists), a `select("*", { count: "exact" })` vehicle
query, and a second query against `vehicle_images` that pulls every image
row per vehicle in the batch and picks the primary one in JS. Six sequential
batches ≈ 18–24 awaited Supabase ops per page load. Response sets
`Cache-Control: private, no-store`, so nothing is cached across reloads.

**Fix:** select only needed columns (not `*`), resolve primary image via SQL/
view instead of N+1 in JS, only compute exact count once (or estimate), move
metering off the hot path, cache tenant resolution, add a short tenant-scoped
cache with invalidation on admin writes.

## 3. Route-level code splitting is defeated by an eager-preload effect

Something in the app effect-preloads nearly every lazy route right after
mount: `loadAccountPage`, `loadStoryHomePage`, `loadProductsPage`,
`loadVehiclesPage`, `loadVehicleDetailPage`, `loadProductDetailPage`,
`loadShowcasePage`, `loadContactPage`, `loadShowcaseTitleCard`,
`loadAdminRouter`, `loadExperience`. The trace shows unrelated chunks
(ProductsPage, ShowcasePage, AdminRouter, Experience, CanvasErrorBoundary,
OllamaChat) loading from the inventory page.

**Fix:** delete the global preload effect. Preload only the current route
immediately; prefetch likely-next routes on idle or on nav-item
hover/focus. Three.js experience and the admin dashboard should never load
from a visit to `/vehicles`.

## 4. Sound system eagerly preloads every registered sound

`SoundProvider` initializes on mount and builds an audio pool (default 3
elements) per registered sound with `audio.preload = "auto"` — for every
sound in the library, including duplicate keys pointing at the same physical
file (e.g. `click-sharp` and `click-firm` both create pools for the same
`.flac`). Trace shows 7 requests for one click sound alone plus repeats for
chat/product/nav/showcase sounds.

**Fix:** build pools lazily on first playback, dedupe pools by physical
`src` (not sound key), `preload="none"` for non-essential sounds, only load
showcase sounds when entering the showcase.

## 5. Broken ambient music loads globally, including on `/vehicles`

`OutsideShowcaseMusic` mounts on normal public routes and eagerly creates an
audio element (`preload="auto"`) for `audio/showcase-ambient-loop.mp3`,
which currently 404s and also fails CORS (`No Access-Control-Allow-Origin`)
against R2.

**Fix:** either upload the asset to the correct R2 key with a correct CORS
policy, or don't instantiate the component outside the home/showcase
experience — and only after a user gesture there.

## 6. `contentscript.js` console warnings are external noise

`ObjectMultiplex`, `app-init-liveness`, `background-liveness`,
`MaxListenersExceededWarning` — this pattern is a browser extension
(commonly a wallet), not LUME's own code. Re-test in Incognito with
extensions disabled to rule it out before investigating further.

## 7. Duplicate/redundant Supabase calls

Repeated `profiles?select=username`, `tenant_by_slug`, `get_tenant_theme`,
`list_published_nav_pages`, `get_published_page` — likely because both the
older `AuthProvider` and the newer visitor-auth layer are mounted
simultaneously, each independently checking session/profile. Not the main
delay, but worth deduplicating/caching once the bigger items are fixed.

## Recommended order of work

1. **Inventory pagination** — single-page fetch + separate facets endpoint. Largest expected win.
2. **Restore real route lazy-loading** — delete the eager preload-all-routes effect.
3. **Stop global audio preloading** — lazy pools, dedupe by URL.
4. **Optimize `/api/vehicles`** — fewer round trips, no per-batch exact count, image resolved in SQL, short cache.
5. **Clean up secondary requests** — fix ambient audio, cut duplicate auth/profile calls, cache page-builder RPCs.

## Bottom line

LUME currently behaves as if it must prepare the *entire app and entire
vehicle catalog* before the inventory experience counts as loaded. The SCRUM-111
vehicle-image association work added one more query per batch, but it did not
create this architecture — the page was already downloading the whole
catalog; the image join just made each of those already-unnecessary batch
requests a bit more expensive.

**Target:** one small inventory API request, one current-route bundle, and
only visible vehicle images on first paint.
