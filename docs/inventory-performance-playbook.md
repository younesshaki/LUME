# Inventory performance playbook

This document records the public inventory techniques that are safe to reuse
for other LUME public and Admin surfaces. The goal is a fast first useful
render without changing the data that a visitor sees, weakening tenant
isolation, or hiding recent Admin changes.

## What "fast" means

Measure the visitor-visible milestone, not just the HTML `load` event:

1. Navigate with a fresh browser context and an empty HTTP cache.
2. Record first contentful paint (FCP).
3. Record the moment the first real inventory card is visible.
4. Record the inventory API, facet API, image, JavaScript, and transferred-byte
   timings separately.

The original live baseline on 2026-07-18 showed that the document load event
could finish well before cards appeared. The relevant metric is therefore
**first real inventory card**, not `window.onload`.

## Staging validation — 2026-07-18

The full first-card optimization set was deployed to `staging` at commit
`ad8a86a` and measured with fresh headless-Chromium contexts at 1440×900
against the staging `demo` tenant. This is a staging measurement, not a
production claim.

| Milestone | Result |
| --- | ---: |
| Earlier staging median, before route-intent prefetch | 2.94 s |
| Later warm first-card samples | 1.06 s, 1.12 s, 1.17 s |
| Median across the five most recent samples | 1.17 s |
| Initial visible card page | 24 vehicles, one request |

Cold edge/network conditions still produced slower outliers (3.17 s and
8.32 s), so record a sample set rather than treating a single number as a
release criterion.

The staging database has migrations 070 and 071 applied, and the staging-only
`LUME_INVENTORY_SLUG_FAST_PATH=true` flag is enabled. Before enabling that
flag elsewhere, verify both migrations are present in that environment first.

## Inventory critical path

The first card path is now deliberately narrow:

```text
route chunk → tenant-scoped first page (24 cards) → render first cards
```

It explicitly excludes work that can complete after the visitor has useful
content:

- exact result counts;
- filter facets;
- non-primary card thumbnails;
- the large cinematic background image.

The visitor still receives all of that work shortly afterward; it simply no
longer competes with the first inventory response.

## Techniques implemented

### 1. Render data before metadata

`loadVehicleResults` requests only the current server-side page. It does not
ask PostgREST for an exact count in the initial response. After React paints
the cards, `loadVehicleCount` fetches and memoizes the exact count for
pagination. This preserves correct page numbers while removing count work from
the first-card path.

Filter facets use the same after-paint scheduling. They remain server-derived,
tenant-scoped, and accurate; dropdown values just do not block a marketplace
visitor from seeing vehicles.

### 2. Cache only safely addressable public inventory

The standalone Vercel inventory and facets functions can return:

```http
Cache-Control: public, max-age=0, s-maxage=10, must-revalidate
```

only when the URL contains `tenant=<slug>` and an optional
`X-Lume-Tenant` header agrees with it. That makes the URL itself a tenant-safe
CDN cache key. Header-only or conflicting requests stay:

```http
Cache-Control: private, no-cache
```

The freshness window is intentionally short. `tenant_inventory_versions`
already changes after vehicle and managed-image mutations, and the 10-second
edge TTL avoids a permanently stale public list while eliminating many repeat
database round trips. Do not increase it without either explicit CDN
invalidation or a versioned URL strategy.

### 3. Keep database work index-friendly

Migration `070_inventory_fast_path_indexes.sql` is additive. It is applied on
staging and adds indexes for:

- the common `tenant + live + recommended sort` listing path;
- the lateral lookup of the ordered managed primary image.

It does not change tables, RLS, function grants, or tenant filters. Apply it
through the normal reviewed migration process before expecting the database
portion of this optimization in any environment where it is not already
present.

Migration `071_public_inventory_slug_fast_path.sql` is also additive. It is
applied on staging and introduces slug-aware, public-read RPCs that combine
active tenant lookup with the inventory or facets projection. Keep
`LUME_INVENTORY_SLUG_FAST_PATH=false` until 071 has been applied in the target
environment, then enable it deliberately. This avoids even a single failed
RPC attempt during a code-first deployment; the existing UUID-based path
remains unchanged until the fast path is ready.

### 4. Avoid competing large downloads

The inventory route defers the shared 1.9 MB cinematic artwork until inventory
cards have completed a browser paint. The visual treatment still appears
immediately afterward, but it cannot compete with the API response or the
first card images on a constrained connection.

The first four card images are eager/high priority; later card images are lazy
and asynchronously decoded. CSS already reserves the card image aspect ratio,
so this does not create layout shift.

### 5. Keep the inventory route genuinely route-scoped

When Page Builder is enabled, `/vehicles` now loads a dedicated
`VehiclesPageRendererRoute` chunk instead of the generic renderer entry that
imports Home, Products, Showcase, and Contact route modules. The page-builder
document check uses the fully functional inventory as its loading fallback, so
published blocks can enhance the route without delaying cards.

The cinematic story provider is also route-lazy. A normal inventory visit no
longer pulls the showcase story service and its backend integration into the
initial application chunk.

Concurrent requests for the same visible page are coalesced in the catalog
client. This protects against React development Strict Mode and route fallback
mounts producing duplicate first-page requests.

### 6. Start first-card data on confirmed route intent

The Vehicles navigation link already receives high-confidence hover, focus,
and pointer-down signals. On those signals—and immediately when a visitor
enters `/vehicles` directly—the app starts two independent tasks in parallel:

- loading the route module;
- fetching the exact visible page of 24 cards.

The catalog holds that prefetched response for at most eight seconds. This is
long enough for the destination component (including React Strict Mode's
development replay) to consume the same response without a duplicate request,
but short enough that it is not a general browser cache. Failed speculative
requests are discarded and the route's normal API/legacy fallback remains the
source of truth.

Do not prefetch a bot-directed inventory navigation until the destination has
resolved its pending bot filters; otherwise the default page and filtered page
would compete unnecessarily.

### 7. Short-circuit deterministic anonymous account checks

The public visitor proxy returns the correct `401 Unauthorized` for
`GET /api/visitor/me` when the browser has no LUME visitor-session cookie. It
does this before contacting the Admin service. Authenticated requests still
use the trusted upstream session/tenant validation path. This keeps visitor
account correctness intact while removing a non-critical cross-service call
from an anonymous inventory visit.

The card request and visitor check may still overlap during a direct cold
visit. Do not reintroduce an auth gate around inventory rendering: saved state
can resolve after visible cards render.

## Important Page Builder caveat

Normal public inventory uses the hand-built `VehiclesPage` when preview mode is
off. Opening a URL with `?preview=lume` enables Page Builder preview mode; a
published `VehicleInventory` block can still use the legacy `loadVehicles()`
path, which requests 200-vehicle pages and may drain the full catalog.

This does not affect the normal public `preview=off` route measured above, but
it must be corrected before Page Builder inventory rendering is enabled as the
default public experience. The fix should make that block consume the same
server-paginated `loadVehicleResults()` path and route-prefetch handoff—never
`loadVehicles()`.

## Reusable rules for future routes

1. Define the first useful visitor action, then optimize that—not a generic
   page lifecycle event.
2. Start independent calls in parallel only when they are both critical. Delay
   non-critical calls until after a paint.
3. Keep list payloads narrow and request an exact count only when UI actually
   needs it.
4. Cache public data only when the URL completely identifies the tenant and
   authorization context. Never use a shared cache for a header-only tenant
   selector.
5. Preserve a small bounded freshness window for admin-managed data unless a
   real invalidation mechanism exists.
6. Match indexes to actual `WHERE`, `ORDER BY`, and lateral-join patterns;
   inspect a query plan before adding broader indexes.
7. Load above-the-fold images intentionally and lazy-load the rest. Reserve
   layout space before images decode.
8. Treat fallbacks as product behavior: CSV, special-image, and legacy-image
   paths must remain intact when the fast API path is unavailable.

## Verification checklist

Before promoting an inventory change:

- Run `npm run check:migrations`, `npm run typecheck:all`, and `npm test`.
- Build both public and Admin applications.
- Cold-load `/vehicles` in a browser and measure first card visibility.
- Verify the initial page issues one inventory request and does not download
  the full catalog.
- Change a vehicle and its primary image in Admin; verify the public list
  updates after cache expiry and retains correct tenant isolation.
- Test a tenant with no inventory and the default tenant's legacy/CSV fallback.
- Check slow-network and mobile profiles; confirm images do not cause layout
  shift or delay text/card rendering.

## Next opportunities

If the measured cold path remains above target after migration 070 and a
deployment, investigate in this order:

1. explicit CDN tag/purge invalidation, allowing a longer edge TTL safely;
2. responsive image variants/AVIF for card thumbnails;
3. removing the remaining route-start dependency between visitor-session
   resolution and the first card request;
4. deferring nonessential global providers and chat initialization until the
   first cards are visible.
