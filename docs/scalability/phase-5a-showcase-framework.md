# Phase 5a — showcase framework and loader

Slice **5a only**, based directly on staging `2f22f6f`, application commit `b991a8679202eb653d3a1eed75ed8f10edd91357`, branch `feat/phase5a-showcase-framework`. PR [#103](https://github.com/younesshaki/LUME/pull/103) stays an unmerged reference; this branch does not stack on or merge it. No `showcase-poc/` runtime folder is present.

The production foundation now has three server-framed, client-only route surfaces, one opening scene, explicit model/renderer ownership, self-hosted Draco and a measured build receipt. This is not the full showcase migration. Scenes/choreography, postprocessing, sound, physical-device and visual-parity work in **5b–5e remain unstarted**. No live traffic, deployment or production configuration changed.

**Local foundation gates pass. Hosted model-render proof remains open for 5e:** the selected R2 origin still omits CORS headers. Normal browser failure and controlled-header rendering are recorded separately. Successful screenshots below use the exact real R2 bytes with a **test-harness-only** allow-origin response header; they do not prove hosted/direct R2 success. Owner approval is required before any bucket CORS update. No app proxy, runtime CORS workaround or firewall exemption was added.

## Routes and structure

| Route                  | Server responsibility                                                                                 | Client island                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `/showcase`            | Verified per-request tenant, title/description/OG/canonical, one h1, navigation, noindex and noscript | Lightweight landing/entry; no engine/model request            |
| `/showcase/intro`      | Same frame; canonical points to tenant showcase landing                                               | Lightweight title card and Play link; no engine/model request |
| `/showcase/experience` | Same frame and validated entry/asset URLs                                                             | Experience, owned Canvas shell and one opening scene          |

`ShowcaseIsland` uses distinct `next/dynamic(..., { ssr: false })` imports inside its `"use client"` facade. The wrappers import no WebGL. All receive the same reserved geometry as their loading fallback; the experience reserves 260svh, reduced-motion 100svh. Scoped overflow resets apply only while `.showcase` exists and stop matching after exit, preserving other Next routes and Vite/shared stylesheets. Noscript hides the empty reserved region and exposes meaningful server content/product navigation.

The entry registry currently supports only the existing product's legacy `part=6&chapter=0` (also the default). Duplicate, malformed or other coordinates return 404 instead of silently showing the wrong chapter. Unknown tenants and draft/preview selectors also return 404. 5b/5c can extend the registry as actual chapters become available.

Server `showcaseAssets()` derives the one curated product URL solely from `WEB_PREVIEW_R2_PUBLIC_BASE_URL`: public HTTPS, no credentials/query/fragment/control characters, no request-selected URL/key. Missing media has an explicit empty state; invalid configuration fails closed. Only the public model URL and plain entry/tenant props cross into the island.

The one scene adapts the current opening text/Sparkles settings and uses the real catalog GLB to exercise the pipeline. The source scene itself contains Sparkles; its scaffold hero-model URL is not the real product asset. This slice does not claim complete narrative timing/flip-word, scroll-camera, GSAP director, video, story-state, audio or lighting parity. Lenis/GSAP choreography remains **5b**, not hidden work in this foundation.

## Model ownership and loading contract

The production hook replaces the reference hook's global parsed-GLTF cache. **Each mounted view owns its parse and all GPU objects**. Browser HTTP caching may reuse bytes, but parsed geometry/material/texture lifetimes are never shared between views. This favors predictable teardown over cross-mount parse caching; future caching must retain these ownership guarantees.

1. An effect creates the resource; render itself starts no I/O. Abandoned/StrictMode/Suspense renders cannot orphan a request. A stale URL/attempt binding cannot show another resource while its effect changes.
2. CORS fetch uses `credentials: omit`, rejects redirects, enforces declared **and streamed 32 MiB** limits, and validates the binary header/version/length/JSON before parsing.
3. This contract accepts self-contained binary glTF 2.0 with embedded images/buffers. External URI resources are rejected before the parser can fetch them. The current real model requires Draco and embedded WebP, both proven. External `.gltf` resources and new decoder formats need an explicit later policy extension.
4. The resource settles Suspense on success, failure, timeout or abort. A 30-second cap and explicit loading/error/empty/retry states prevent hanging views or false success. Retry creates a new attempt and releases the previous lease.
5. Disposal traverses **all parsed scenes**, deduplicates geometry/material/texture disposal, handles shader-uniform and skeleton textures, closes owned image bitmaps and releases decoder workers/blob URLs. The parser's public dependency API tracks allocations that finish after cancellation or a partial parse error.
6. On unmount, pending model HTTP is aborted, late parse results are released, the renderer stops and its context closes. A render/initialization error also releases the model immediately through the DOM error boundary. No cache entry keeps disposed assets available to another view.

The byte limit is a download bound, not a claimed GPU-memory/performance budget; real-device asset budgets remain 5e work.

## Decoder decision: self-hosted WASM

The unmodified glTF Draco WASM wrapper and decoder ship at `/showcase-assets/draco/three-0.164.1/`, from the **pinned Three 0.164.1 npm distribution**. The directory labels the distributing Three version, not an inferred standalone Draco version. Sizes/SHA-256 are in [provenance.json](../../apps/web/public/showcase-assets/draco/three-0.164.1/provenance.json), with Draco and Three licenses alongside.

| File                          |       Bytes |
| ----------------------------- | ----------: |
| `draco_wasm_wrapper.js`       |      58,456 |
| `draco_decoder.wasm`          |     192,420 |
| Total distinct decoder bodies | **250,876** |

This removes gstatic availability/version drift and extra third-party decoder origins. Both same-origin HTTP 200 responses and WASM MIME are recorded; no gstatic requests occurred. WASM is required explicitly, with a tested unsupported-browser fallback and no hidden JS/CDN fallback. Only decoder files are vendored; the real GLB remains on R2.

Three 0.164.1 can create a worker after `dispose()` if decoder initialization is still pending. One **instance-local, pinned `_getWorker` adapter** terminates such late workers. Its presence is checked fail-closed; it is not a global patch. A real browser test delays the WASM response, navigates away, then releases it: both workers terminate, the bitmap closes, blob URLs are revoked and no renderer context is created. Re-test this adapter and the decoder receipts whenever upgrading Three. Three-owned static decoder fetches may finish after abort; their completion cannot retain a worker or parsed-resource allocation.

A future CSP needs to permit same-origin decoder files, blob workers and WASM compilation; this slice does not change CSP, origin allowlists or any firewall setting. Preview cache headers/diagnostic interception are not used to claim production transfer-cache efficiency.

## Canvas failure handling

The high-level R3F Canvas does not forward its asynchronous `configure()` rejection through its child error boundary; the unsupported-context test exposed that failure path. `ShowcaseCanvas` therefore owns the documented R3F `createRoot` API and the renderer explicitly. It catches constructor/configure/resize and scene-render failures, stops callbacks, disposes the renderer and closes the context. Intrinsic registration is limited to constructors used by this scene; later scenes add what they need.

The Three subtree is a separate R3F root. Navigation/tenant/consent UI stays in the DOM tree; later story/audio context must be provided or bridged explicitly inside that root. This opening scene needs no inherited DOM context, and provider parity is not claimed here.

The shell owns resize observation and event setup; native Next/browser scroll restoration is left intact. A live reduced-motion preference update changes the same root between continuous and demand frames without reloading the model. Scene-render errors are handed to the DOM boundary after the render commit; no global error handler suppresses failures.

## Captured evidence

All tenant/content data here is **synthetic loopback-only**, never fabricated remote tenants. The public GLB is real: **603,908 bytes**, SHA-256 recorded. A [read-only Preview-binding audit](evidence/phase-5a/media-binding.json) confirms the origin selected for verification. No remote data, account, session, lead or tenant setting was created/changed.

- [Browser report — 18 cases](evidence/phase-5a/report.json)
- [Emitted module/chunk receipt](evidence/phase-5a/bundle-receipt.json)
- Raw HTML: [landing](evidence/phase-5a/showcase.html), [intro](evidence/phase-5a/showcase-intro.html), [experience](evidence/phase-5a/showcase-experience.html)
- Controlled-header rendering: [desktop](evidence/phase-5a/opening-desktop.jpg), [390×844 reduced motion](evidence/phase-5a/opening-mobile-reduced.jpg)
- Unmodified access: [actual R2 CORS failure](evidence/phase-5a/r2-cors-blocked.jpg)
- [JavaScript-disabled experience](evidence/phase-5a/nojs-experience.jpg)
- [Verification record](evidence/phase-5a/verification.txt)

| Gate                         | Result                                                                                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SSR/hydration                | Three raw server documents, correct metadata/canonical, exactly one h1 each, noindex headers; **zero hydration/SSR-browser-global errors and zero unhandled browser errors** across all browser cases                    |
| Readable without JS          | All three routes show their server heading and visible noscript product link; no canvas                                                                                                                                  |
| Split bundles                | Fresh home, vehicles, landing and intro request **zero** heavy chunks/model; experience requests all four                                                                                                                |
| Leva/debug tooling           | **Zero** emitted production Leva or r3f-perf modules                                                                                                                                                                     |
| Actual rendering             | Native WebGL indexed draw calls, Draco/WebP decode, real model screenshots; successful run has zero page/console errors                                                                                                  |
| States                       | Explicit suspense before canvas allocation; invalid model → error → successful retry; empty GLB → empty state; missing WASM → fallback without a model request; failed WebGL constructor → fallback with bitmap released |
| Normal lifecycle             | Actual texture/buffer/program release, one owned bitmap closed, both workers terminated, blobs revoked; the canvas context closes on exit                                                                                |
| Cancellation race            | Delayed real decoder init completes after exit; both late workers terminate, bitmap closes, zero canvas contexts created                                                                                                 |
| Navigation/restoration       | Native Next links landing → intro → experience, exit, Back and refresh; restored scrollY 700 with a fresh active rendered context                                                                                        |
| Reduced motion               | Fresh mobile demand mode and live preference toggle stop continuous draws; toggling back resumes the same model/context                                                                                                  |
| Tenant/entry/draft isolation | Five unknown/duplicate/unsupported/draft cases return 404; no invented extra remote tenant                                                                                                                               |
| Direct/hosted R2             | **OPEN**: local browser blocked; GET probes also omit allow-origin for the stable Preview origin. Hosted Next model rendering has not been run; owner-approved CORS and 5e proof required                                |

The explicit model texture and geometry releases are supplemented by full context closure, which releases remaining renderer/default GPU allocations. The raw audit distinguishes allocation/delete calls from context-loss release; it does not pretend every driver allocation receives a matching explicit delete. Software **ANGLE/SwiftShader** is recorded, not a physical-device performance approval.

## Bundle sizes

Actual emitted minified file sizes and sum of per-file gzip sizes, not CDN transfer/Brotli/LCP/TTI claims. Initial route measurement precedes the separate lifecycle journey.

| Initial route          |  JS bytes | Gzip bytes | Heavy chunks requested |
| ---------------------- | --------: | ---------: | ---------------------: |
| `/`                    |   915,713 |    291,115 |                      0 |
| `/vehicles`            |   437,082 |    131,555 |                      0 |
| `/showcase`            |   446,226 |    135,067 |                      0 |
| `/showcase/intro`      |   446,262 |    135,086 |                      0 |
| `/showcase/experience` | 1,174,130 |    330,490 |                      4 |

The full asynchronous island is **728,519 bytes /195,815 gzip bytes**. Separate model/decoder bodies add 603,908 +250,876 bytes. Code already downloaded can remain cached after leaving a route; the proven property is that ordinary fresh routes never request the engine, and mounted resources are released on exit.

| Async chunk                    |   Bytes | Gzip bytes |
| ------------------------------ | ------: | ---------: |
| `9d78c252.7a9347a71bd22cf0.js` | 515,897 |    127,585 |
| `5779.c127f460cacd7ff7.js`     |  92,337 |     30,043 |
| `1329d575.685714fd1c99a513.js` | 109,698 |     33,957 |
| `488.58b438f53409ce49.js`      |  10,587 |      4,230 |

## Local gate and unchanged surfaces

Real `npm ci --legacy-peer-deps` in a dedicated worktree; no node_modules directory symlink. Before bare typecheck the web `.next`, `next-env.d.ts` and incremental state were deleted.

| Command                                                                          | Result                                                                            |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `npm run typecheck:all`                                                          | PASS clean, before generated Next declarations                                    |
| `npm run build --workspace=@lume/web`                                            | PASS including boundary guard                                                     |
| `node --import tsx --conditions=react-server --test apps/web/checks/*.check.mjs` | **68/68 PASS** (55 existing +13 showcase/loader/ownership checks)                 |
| `npm run verify:showcase --workspace=@lume/web`                                  | PASS, 18 cases; direct R2 intentionally remains an open gate                      |
| Existing `npm run build`                                                         | PASS                                                                              |
| `npm run check:migrations`                                                       | PASS, 92 sequential files; no migrations                                          |
| `git diff --check`                                                               | PASS                                                                              |
| Compiled credential scan                                                         | PASS, 150 server/client files, zero inherited configured credential-value matches |

`apps/web/config/environment.ts` is **unchanged**. Only existing WEB_PREVIEW bindings are used; no new client/public env or server-secret requirement. The boundary capability is scoped exclusively to explicitly `"use client"` files inside `components/showcase/`: Three, R3F, drei, R3F postprocessing/postprocessing, Lenis and GSAP. Server code, shared packages, unrelated client folders, directive-less helpers, client→server/config/Node/process access and Leva imports remain rejected. Future packages are allowed by policy, not falsely claimed implemented in 5a.

Every pre-existing lockfile package entry is unchanged except web's requirements; new scoped dependencies are added. No root Vite source/build/deploy config, admin, shared package or database changes. No hosted Next deployment, traffic cutover, R2 CORS/env change or later-slice work. Root Vitest/admin build and branch GitHub CI were not run/claimed at preparation time; no SFTP test modified/masked.

## Review and next slice

The framework is ready for review and extension, not approval of complete showcase parity. 5b adds actual scene/chapter camera/Lenis choreography and extends the entry registry; 5c covers remaining scenes/postprocessing; 5d covers audio/consent and polish; 5e supplies physical-device, parity, performance and **hosted** render proof. The owner must approve preview-origin CORS on the `lume` bucket before that hosted model gate can close. No CORS action was taken here.

Keep the decoder/Three pin together and re-run cancellation/disposal checks on upgrades. Retain exclusive ownership if adding cache optimizations. Global parsed-model caching, external asset URIs, extra chapter fallbacks or mandatory cinema on ordinary routes are not implicit extensions of this slice.

Publish one draft PR into staging only after Josh's push approval, then stop for review. Do not merge PR #103 or begin 5b.
