# Frontend startup and asset-loading measurement

## Baseline capture

The pre-fix Chrome trace for `/vehicles` (demo tenant) recorded:

- 152 requests
- 27.4 MB transferred
- DOMContentLoaded: 338 ms
- window load: 5.81 s
- network settled: 34.54 s
- unrelated Admin, Experience, Showcase, Three.js, chat, and route chunks
- repeated audio requests, including a missing ambient R2 file

## Local production-build capture

Measured headlessly against `vite preview` after this change, with a mocked
24-card inventory response and rejected analytics consent. The capture waited
2.5 seconds after the first card to expose delayed/idle imports.

- 26 requests
- 4,330,776 encoded bytes transferred
- 272,223 encoded JavaScript bytes
- 0 audio requests
- 1 inventory-list request
- 1 facet request
- first card visible at 446 ms
- mocked inventory API duration: 1 ms

Requested scripts included the app shell, VehiclesPage, its footer/catalog
dependencies, and the explicitly enabled local-chat widget. They did **not**
include AdminRouter, Experience, ShowcasePage, registerBlocks, or the heavy
CanvasErrorBoundary/Three.js chunk.

The before and after captures use different API conditions, so total bytes and
timings are directional rather than a production benchmark. The route/chunk,
request-count, and audio assertions are directly comparable architectural
checks. A preview deployment should repeat this capture against real data.

## Manual validation

1. Load `/vehicles` in Chrome DevTools with cache disabled and do not interact
   with navigation for three seconds.
2. Confirm AdminRouter, Experience, ShowcasePage, and CanvasErrorBoundary are
   absent from Network > JS and no audio request is made.
3. Hover or focus Products, then confirm only the Products route chunk appears.
4. Navigate to Showcase and confirm the bundled same-origin ambient asset is
   requested only there/home, without an R2 404 or CORS error.
5. Rapidly trigger sounds that share a URL; confirm the pool grows on demand
   and does not issue startup requests.
6. Repeat with analytics consent rejected and accepted; analytics and speed
   insights should load only in the accepted case.
