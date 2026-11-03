# Phase 5b — showcase scenes + choreography

**Local application commit `ad9e9dc97f36f9e18672d67efc6663a6d07890f6`**, branch `feat/phase5b-showcase-choreography`, based directly on staging `b490224a8` (5a). Only slice **5b** is implemented. No push, hosted deployment, traffic change, database operation or production configuration change has been performed.

The three-scene approach is locally viable: independently owned model views, a scroll-driven camera, a tenant-local story bridge and deterministic scene teardown work under the production Next build. This is ready for a draft review, **not approval of full showcase parity or hosted rendering**. Direct R2 CORS is still blocked and remains a 5e gate. All successful model screenshots are **Playwright-only render diagnostics** with the exact real R2 bytes and a test response header; no application CORS workaround exists.

## Reviewed batch and source reality

Josh approved **scenes 1–3: Showcase → Signal → Reveal**, with three independently owned views of the one verified real model and video/visual parity explicitly deferred. This closes the opening/problem/reveal story beat without bringing the later craft, context and trust beats (4–6) into the review. Each source beat has duration 25 seconds. Its narrative text, opening pause and flip-word cues are copied from Vite's `scene-{1,2,3}/content.ts`; a check compares those data records to the originals. Runtime Next code never imports the Vite scene tree. The shared Vite scene is Sparkles, not three unique product models.

| Beat       | Camera treatment                                               | Asset weight                              |
| ---------- | -------------------------------------------------------------- | ----------------------------------------- |
| 1 Showcase | Original three crane control points, FOV 48, target origin     | One 603,908-byte embedded Draco/WebP GLB  |
| 2 Signal   | Continue the chapter's .08 rad/s orbit over its 25-second beat | Same URL, fresh independently owned parse |
| 3 Reveal   | Continue that orbit, starting two radians later                | Same URL, fresh independently owned parse |

The source hero-model path `models/hero-product.glb` and scene-3 video path `video/showcase-scene-2-high.mp4` return **404**. The first video (`premiumredbull4Khandbrake3.mp4`, shared by the first two source beats) is **7,569,929 bytes**. It is deliberately not downloaded by this batch. [Read-only source-asset observations](evidence/phase-5b/source-assets.json) explain the cut; no missing media was fabricated. The selected model is `blackredbull6.optimized.glb`, SHA-256 `de5b04647e34ff1c7496c19cd77ec1719dde671b8bdb4b57ae1ae4d672b944ce`. There is one distinct model URL, not three distinct source models.

## Implementation and intentional adaptations

`server/showcase/scene-manifest.ts` owns the fixed scene-ID → asset-key map and narrative data. `showcaseAssets()` resolves it from **only** `WEB_PREVIEW_R2_PUBLIC_BASE_URL`. Existing HTTPS/no credentials/query/fragment/control-character rules stay intact. Query parameters cannot choose a key, URL or scene manifest. Missing media produces per-scene empty states. The loader's self-contained GLB policy, redirect/credentials restrictions, streamed byte limit, self-hosted Draco and cancellation/disposal machinery are unchanged. Legacy `part=6&chapter=0` stays the only admitted chapter; unsupported/duplicate coordinates and draft/unknown tenant selectors still 404.

The experience reserves **700svh**: one pinned viewport plus three equal scroll intervals. `useStoryScroll` owns one Lenis instance and one named RAF loop, with Vite's duration/easing/wheel/touch settings. Cleanup cancels the RAF and destroys Lenis. It does not carry forward Vite's mismatched anonymous GSAP-ticker removal. It never resets scroll on mount, allowing Next Back/browser refresh to restore a later scene. Scene buttons use the owned Lenis instance to stop any active wheel animation before jumping. Native `scrollTo` during a running Lenis tween is superseded by the tween; the verifier uses the actual scene controls before precise sampling.

`CameraRig` reads the same external story store from **inside** the R3F root. It samples Vite's crane points `[-1.2,.8,6.4] → [-.3,.3,5.6] → [0,.05,5.2]` piecewise linearly, then the chapter orbit. Camera damping retains `1 - .001^delta`, with a delta cap. The original chapter director's time-driven intro/orbit is mapped to scroll progress here; this is not a claim of identical GSAP timing or Catmull-Rom interpolation. Scene boundaries share camera endpoints; fast skips deliberately cut directly to the selected beat. Shakes, video, crossfades, authored typography/highlight styling and full cinematic parity remain later-slice work.

Authored blank/flip cues become relative scroll weights, so reverse scrolling reverses the narrative deterministically. There is no independent autoplay clock. Reduced motion destroys Lenis, uses demand rendering and a stable camera pose, and exposes all the current scene's original copy with manual scene controls. No-JS output includes all three server-rendered narrative sections, product/navigation links and no canvas. Noindex/one-h1 server framing remains intact on all three routes.

`createStoryStore()` is instantiated per tenant-keyed experience, not globally. `StoryProvider` installs that **same instance explicitly in both the DOM tree and `createRoot(canvas)` tree**; context propagation is never assumed. The store carries scene/progress, motion, existing versioned cookie consent and an explicit disabled audio stub. Shared `CookieBanner` uses its real accept/reject contract, updates the bridge in the same tab, and storage events refresh cross-tab choices. Consent posts retain the existing tenant-scoped `/api/consent` contract. The browser proof intercepts those writes locally; it does not write to staging. Audio creates no context, plays no media and requests no soundtrack, even after consent. 5d can implement playback behind this bridge without changing ownership.

## Per-transition ownership proof

The model owner is keyed by **scene ID**, not URL. Leaving a scene unmounts its model hook and explicit renderer, aborts pending fetch/parse work, disposes geometry/materials/textures/bitmaps, terminates workers, revokes blob URLs and loses the old WebGL context. Re-entering the same URL creates a new lease. HTTP bytes may be cached; parsed GPU objects are never shared. Only the active scene is mounted; there is no hidden retained-scene pool or crossfade.

[Captured browser report](evidence/phase-5b/report.json), `transitions` records:

| Transition | Old context lost | Old GL deletes: buffers / programs / textures | Bitmaps closed | Workers created / terminated (cumulative) | Live contexts |
| ---------- | ---------------- | --------------------------------------------- | -------------- | ----------------------------------------- | ------------- |
| 1 → 2      | yes              | 7 / 2 / 1                                     | +1             | 4 / 4                                     | 1             |
| 2 → 3      | yes              | 7 / 2 / 1                                     | +1             | 6 / 6                                     | 1             |
| 3 → 2      | yes              | 7 / 2 / 1                                     | +1             | 8 / 8                                     | 1             |
| 2 → 1      | yes              | 7 / 2 / 1                                     | +1             | 10 / 10                                   | 1             |
| 1 → 3      | yes              | 7 / 2 / 1                                     | +1             | 12 / 12                                   | 1             |
| 3 → 1      | yes              | 7 / 2 / 1                                     | +1             | 14 / 14                                   | 1             |

Every transition checks zero outstanding workers/blob URLs and exactly one live context, including reverse and skipped beats. Unit checks additionally count **geometry, material, texture and bitmap** disposal exactly once for five sequential same-URL leases. GL program/buffer/texture deletes and context loss are actual browser observations, not counters shipped in the application. Context loss releases renderer-owned allocations that do not receive individual explicit deletes; the table intentionally does not claim created/deleted GL counts are identical. This proves lifecycle behavior on software ANGLE/SwiftShader, not measured physical VRAM or a device-performance budget.

Two cancellation cases delay the real decoder WASM response, exit a scene or the route, then release it. During a scene switch the report records **4 workers created/4 terminated, 4 blob URLs/4 revoked, one old bitmap closed and one live new context**. During route exit it records **2/2 workers, 2/2 blob URLs, one bitmap closed and zero contexts**. This exercises the pinned late-worker guard through a real transition, beyond the final-unmount test inherited from 5a.

## Camera, routing and safety receipts

The verifier samples real GPU `viewMatrix` uniforms and reconstructs camera world positions. At opening progress .15 the observed pose is approximately **[-.931, .651, 6.161]**; at .75 it is **[-.155, .178, 5.405]**, within .03 world units of the expected **[-.15, .175, 5.4]**. Every later transition also compares the observed pose with that beat's crane/orbit target. Progress increases, the canvas container remains pinned at top 0, Lenis is active, and a real wheel event produces multiple intermediate scroll positions (see `choreography.wheelTrail`). Back and refresh both restore **scrollY 4496 / scene 3**; the verifier waits for that scene and a fresh actively drawing context, not a previously disposed context's draw count. Leaving the route removes the Lenis class.

The final browser run passes **19 named cases plus six transition samples** with **zero hydration errors and zero unhandled browser errors**. Successful controlled-header renders have zero console errors. Expected CORS/corrupt-model/WebGL failure-path console messages are retained separately; they are not hidden as successful renders. Mobile reduced-motion tests visit all three scenes, keep one live context, and stop continuous frames. Retry, empty model, unsupported WASM, initialization failure, no-JS, negative selectors and landing → intro → experience remain covered.

The consent test captures **accepted → rejected**, version 1, and verifies **0 AudioContexts / 0 media play calls / 0 media requests**. It proves the DOM bridge and local contract dispatch; hosted consent ingestion is not newly claimed by this slice.

`apps/web/config/environment.ts` and `scripts/check-boundaries.mjs` are **byte-for-byte unchanged** from staging. Three/R3F/drei/Lenis remain inside explicitly `"use client"` files scoped to `components/showcase/`; no broader allowlist, secret binding, public env variable, admin runtime import or server bypass was added. The compiled graph has **0 admin/db/rag/Leva/r3f-perf modules**; the [credential scan](evidence/phase-5b/boundary-scan.json) finds 0 inherited configured credential-value matches across 112 compiled JS files. That scan is scoped to inherited configured values, not an assertion that unknown secrets can be detected universally.

## Code-split receipt

[Full emitted module/chunk receipt](evidence/phase-5b/bundle-receipt.json) plus browser-request evidence in `report.json`. All values are emitted minified bytes/sums of per-file gzip, **not** Brotli transfer, LCP or TTI measurements.

| Fresh route            |  JS bytes | Gzip bytes | Heavy chunks requested |
| ---------------------- | --------: | ---------: | ---------------------: |
| `/`                    |   915,822 |    291,155 |                      0 |
| `/vehicles`            |   437,084 |    131,556 |                      0 |
| `/showcase`            |   446,235 |    135,073 |                      0 |
| `/showcase/intro`      |   446,271 |    135,092 |                      0 |
| `/showcase/experience` | 1,199,063 |    338,032 |                      4 |

| Heavy asynchronous chunk       |   Bytes | Gzip bytes |
| ------------------------------ | ------: | ---------: |
| `9d78c252.7a9347a71bd22cf0.js` | 515,897 |    127,585 |
| `7655.6fabb6cec9e21f6a.js`     | 110,712 |     35,186 |
| `1329d575.685714fd1c99a513.js` | 109,698 |     33,957 |
| `583.5529e6fb064465fd.js`      |  17,136 |      6,623 |

Total heavy island: **753,443 bytes / 203,351 gzip**, versus 5a's 728,519 /195,815 (**+24,924 /+7,536**). All four chunks load only on `/showcase/experience` in fresh-route measurements. **Leva: 0 emitted production modules; r3f-perf: 0**. Model and same-origin decoder bodies remain separate: 603,908 +250,876 bytes. Downloaded JS may remain in browser cache after route exit; mounted GPU/worker state does not.

## Verification and reproduction

Real `npm ci --legacy-peer-deps` in `/workspace/lume-phase5b`, no node_modules directory symlink and no lockfile changes. Web `.next`, untracked `next-env.d.ts` and incremental state were removed before the final standalone typecheck, then the production build was regenerated.

| Command / check                                                                  | Result                                                           |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `npm run typecheck:all`                                                          | PASS clean; includes blocks/admin/web/workspace checks           |
| `npm run build --workspace=@lume/web`                                            | PASS, including unchanged import boundaries                      |
| `node --import tsx --conditions=react-server --test apps/web/checks/*.check.mjs` | **74/74 PASS** (68 existing +6 choreography checks)              |
| `npm run verify:showcase --workspace=@lume/web`                                  | PASS: 19 cases, 6 measured transitions; direct CORS remains open |
| Existing `npm run build`                                                         | PASS (Vite)                                                      |
| `npm run check:migrations`                                                       | PASS: 92 sequential files, no changes                            |
| `git diff --check`                                                               | PASS                                                             |
| Production module/credential scan                                                | PASS, scoped as above                                            |

Raw logs are committed next to the report. Root Vitest/admin build and GitHub CI have not been run or claimed for this unpublished branch; no SFTP test was modified or masked. Root Vite source/build/deploy files, admin, shared packages, package manifests/lock, migrations, firewall and boundary checker are unchanged.

```sh
npm ci --legacy-peer-deps
rm -rf apps/web/.next
rm -f apps/web/next-env.d.ts apps/web/tsconfig.tsbuildinfo
npm run typecheck:all
npm run build --workspace=@lume/web
node --import tsx --conditions=react-server --test apps/web/checks/*.check.mjs
WEB_PREVIEW_R2_PUBLIC_BASE_URL='<existing public preview binding>' \
SHOWCASE_EVIDENCE_DIR='/tmp/lume-phase5b-evidence' \
npm run verify:showcase --workspace=@lume/web
git diff --check
```

The verifier starts an isolated production Next process with loopback tenant/content fixtures, fetches real public R2 bytes, and uses the system Chromium (`CHROMIUM_PATH` can override). In this environment it additionally used `NODE_USE_ENV_PROXY=1`; Chromium pins only the environment proxy CA's SPKI for the test process. No global browser-security or certificate settings were changed. It first records normal CORS failure, then adds the clearly labelled header **only in Playwright routing** for lifecycle/render diagnostics.

## Open gates and review stop

- **5e hosted model rendering:** R2 returns HTTP 200 but no `Access-Control-Allow-Origin` for the stable Preview origin; direct browser access is blocked. No bucket configuration, deployment or runtime proxy was changed. Owner-approved CORS and an unmodified hosted browser run are still required.
- **Later slices:** scenes 4–12, postprocessing/lighting parity, missing video decisions, audio implementation and actual-device parity/performance. None started here. The three owned views explicitly reuse the verified product as approved; this is not three final art assets or a completed visual migration.
- **Transition cost:** each scene reparses/decompresses and briefly shows its loading fallback; no simultaneous ownership/crossfade or seamless-latency claim. Physical devices must establish frame/memory budgets before optimizing byte caching or scheduling. Preserve per-view ownership if adding optimizations.

Recommendation: **review the 5b architecture and local evidence; keep hosted/visual rollout gates open.** Push and one draft PR titled **“Phase 5b — showcase scenes + choreography”** into staging require Josh's approval. Stop for review afterward. No merge, deployment, traffic cutover or 5c work is authorized by this result.
