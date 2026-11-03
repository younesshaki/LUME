# Phase 5c — scenes 4–8 and owned bloom

Application/evidence commit **`10d0d67beecfa06292d00f377149bc8d436269ea`**, branch `feat/phase5c-showcase-effects`, based directly on staging **`2a9fbe0299`**. This is the next reviewable **5c batch**, not a claim that every remaining scene has shipped. Scenes 9–12 are reserved for **5c-2**; audio remains 5d, hosted rendering/physical-device/visual parity remains 5e. No push, deployment, traffic cutover, database or remote configuration change was performed during preparation.

**Local gates pass; hosted R2 model rendering remains blocked.** All successful model screenshots use the exact real R2 bytes with a **Playwright-only CORS response header**. They prove local rendering/lifetimes, not hosted success. Normal direct browser CORS failure is separately captured. No application proxy, CORS bypass or firewall change was added.

## Exact scene cut and source findings

There are **12 numbered scene content files**, not twelve separate unique GLB scenes. Vite's `showcaseScenes` main sequence contains **1–11**; `Scene12.tsx` is a separate Product/CTA phase after product choice. Chapters 2/3 also contain placeholder records; they are not part of this numbered batch. Next's server manifest now contains **1–8**.

| Scene | Title           | Story role                                                 | Duration |
| ----- | --------------- | ---------------------------------------------------------- | -------: |
| 4     | Craft           | Materials, engineering, finish and tangible detail         |     25 s |
| 5     | Experience      | Customer context and use case                              |     25 s |
| 6     | Trust           | Evidence, reliability, specific outcomes                   |     25 s |
| 7     | Benefits        | Function translated into value                             |     25 s |
| 8     | Differentiation | The comparison/proof beat before the final action sequence |     25 s |

This cut completes the middle proof/value arc and keeps the closing Momentum/Statement/brand/product-choice/CTA behavior out of the effects-lifecycle review. Each new narrative record preserves the source `content.ts` text, pauses, highlights metadata and flip-word cues; tests compare all eight records directly with their Vite originals. Source scene 6 has a flip target (`proof`) absent from that line's text; it is preserved without inventing replacement copy. As in 5b, timing is deterministically scrubbed using relative cue weights; authored typography/highlight styling, video and time-driven parity are not claimed.

All eight scene IDs map to the **same curated existing 603,908-byte GLB**, each with a fresh owned parse. No distinct scene models were fabricated. The original scene tree shares Sparkles/video. The source placeholder material/detail models and the three source video keys covering scenes 4–8 return **404** on read-only public HEAD requests ([observations](evidence/phase-5c/source-assets.json)). The batch adds **zero distinct model URLs** or video downloads. This is the existing 5b ownership approach extended to five more narrative/camera views, not a completed media/art port. The selected real model SHA-256 is `de5b04647e34ff1c7496c19cd77ec1719dde671b8bdb4b57ae1ae4d672b944ce`.

The source search found **no active Bloom/EffectComposer** in Vite's `Experience.tsx`, `CameraRig.tsx` or showcase tree; dependencies existed but no effect configuration was available to copy. The bloom here is therefore a **new restrained treatment**, not an invented parity claim. Final artistic approval stays open.

## Server constants and client boundaries

`scene-manifest.ts` extends fixed scene IDs and asset keys; none come from request parameters. **`server/showcase/media.ts` is byte-for-byte unchanged**, preserving 5a/5b's public HTTPS origin policy: no credentials, query, fragment, control characters or backslashes. Missing media still produces empty states. The embedded-only GLB, redirect/credentials/byte-limit policy, owned loader, self-hosted Draco, model disposal and late-worker guard are unchanged.

Legacy `part=6&chapter=0` is still the only admitted chapter; unknown tenants, duplicate/invalid entry coordinates and draft selectors still 404. Next runtime does not import the Vite scene tree; only the data-parity check imports its source fixtures. The experience reserves **1700svh** for eight equal two-viewport intervals plus a sticky viewport. Existing Lenis ownership, per-tenant story/consent/audio bridge, same-origin navigation and server noindex/noscript framing continue unchanged.

`apps/web/config/environment.ts`, `scripts/check-boundaries.mjs`, `next.config.mjs`, live Vite/admin/shared sources, root build/deploy config and migrations are **unchanged**. Only two exact web dependency declarations and two scoped lock entries were added; every pre-existing lock entry other than web's requirements is identical to staging. A second real `npm ci --legacy-peer-deps` validated that preserved lock. No directory symlink or broad import allowance was used.

## Pinned effects and ownership

| Package                       | Exact resolved version | Compatibility                                           |
| ----------------------------- | ---------------------- | ------------------------------------------------------- |
| `three`                       | 0.164.1                | Existing pin retained                                   |
| `@react-three/fiber`          | 9.4.0                  | Existing pin retained                                   |
| `react`                       | 19.2.6                 | Existing pin retained                                   |
| `@react-three/postprocessing` | **3.0.4**              | Peers: React ^19, Fiber ^9, Three ≥0.156                |
| `postprocessing`              | **6.38.0**             | Peer: Three ≥0.157 and <0.182; wrapper requires ^6.36.6 |

[Resolved versions and peer ranges](evidence/phase-5c/resolved-dependencies.json). No root dependency upgrade occurred.

`ShowcaseEffects.tsx` lives entirely in the scoped client-only showcase island. It uses the package's React composer with one additive Bloom: intensity **.25**, threshold **.85**, smoothing **.2**, mipmap blur **5 levels**, half-float buffers. MSAA, normal/depth/stencil passes and animated glitch/noise are disabled. There is no N8AO pass. Reduced motion **unmounts the entire effects subtree** and uses the existing stable camera/demand rendering/manual scene controls. The module bytes still download on the experience route; reduced motion avoids composer allocation/rendering, not the code download.

The pinned wrapper removes effect passes on React teardown but **does not call composer.dispose()**. Relying on React unmount alone would retain buffers. `ownComposer()` snapshots the attached passes, so a removed EffectPass cannot disappear from teardown ownership. It disposes orphaned pass snapshots and the remaining composer exactly once per lease; EffectPass disposal releases Bloom's internal targets/materials. The wrapper Bloom has `dispose={null}`, preventing R3F from independently disposing that same owned object. The renderer-local owner also immediately releases a late attachment after closure. Reduced-motion detach can release a lease and admit a fresh one when motion returns.

On scene exit, R3F rendering is stopped, the composer owner is closed **before renderer.dispose()/context loss**, and the original model hook releases its own geometry/materials/textures/bitmaps/decoder state. A ref detach may happen before the DOM owner's close; the lease is idempotent in either order. The old renderer is never kept in a scene pool.

Four added checks use real CPU-side postprocessing objects to verify main buffers, all unique bloom mip targets, pass/effect disposal, removed-pass ordering, late/superseded leases and reduced-motion reattachment. The library internally aliases one mip target and dispatches its dispose event twice; the test records release of every unique target and one outer composer/EffectPass lease, rather than falsely requiring one event from every library internals path. Actual GPU deletion is separately verified below.

## Actual transition-level GPU evidence

[Raw browser report](evidence/phase-5c/report.json), `transitions`: all eight scenes are visited forward and backward, then skipped from 1→8→1. Each sample waits for the selected scene and an **actively drawing fresh context**, verifies its camera pose, closes an old bitmap, and requires all earlier contexts lost plus exactly one live context. This is not a final-unmount-only assertion.

WebGL calls are instrumented **only by the verifier**. Framebuffer and render-target texture deletion must happen while `gl.isContextLost()` is **false**, so merely destroying the context cannot mask a composer leak. Textures attached through `framebufferTexture2D` are tracked by handle, separately from model textures. Any allocated renderbuffers must also have matching live-context deletes.

| Sample | Transition | Framebuffers created / deleted live | RT textures attached / deleted live | Bitmaps closed | Workers created / terminated (cumulative) | Live contexts |
| ------ | ---------- | ----------------------------------- | ----------------------------------- | -------------- | ----------------------------------------- | ------------- |
| 1      | 1 → 2      | 44 / 44                             | 44 / 44                             | +1             | 4 / 4                                     | 1             |
| 2      | 2 → 3      | 11 / 11                             | 11 / 11                             | +1             | 6 / 6                                     | 1             |
| 3      | 3 → 4      | 11 / 11                             | 11 / 11                             | +1             | 8 / 8                                     | 1             |
| 4      | 4 → 5      | 11 / 11                             | 11 / 11                             | +1             | 10 / 10                                   | 1             |
| 5      | 5 → 6      | 11 / 11                             | 11 / 11                             | +1             | 12 / 12                                   | 1             |
| 6      | 6 → 7      | 11 / 11                             | 11 / 11                             | +1             | 14 / 14                                   | 1             |
| 7      | 7 → 8      | 11 / 11                             | 11 / 11                             | +1             | 16 / 16                                   | 1             |
| 8      | 8 → 7      | 11 / 11                             | 11 / 11                             | +1             | 18 / 18                                   | 1             |
| 9      | 7 → 6      | 11 / 11                             | 11 / 11                             | +1             | 20 / 20                                   | 1             |
| 10     | 6 → 5      | 11 / 11                             | 11 / 11                             | +1             | 22 / 22                                   | 1             |
| 11     | 5 → 4      | 11 / 11                             | 11 / 11                             | +1             | 24 / 24                                   | 1             |
| 12     | 4 → 3      | 11 / 11                             | 11 / 11                             | +1             | 26 / 26                                   | 1             |
| 13     | 3 → 2      | 11 / 11                             | 11 / 11                             | +1             | 28 / 28                                   | 1             |
| 14     | 2 → 1      | 11 / 11                             | 11 / 11                             | +1             | 30 / 30                                   | 1             |
| 15     | 1 → 8      | 11 / 11                             | 11 / 11                             | +1             | 32 / 32                                   | 1             |
| 16     | 8 → 1      | 11 / 11                             | 11 / 11                             | +1             | 34 / 34                                   | 1             |

Every row additionally has `oldContext.lost=true`, GPU buffer/program/texture deletes, equal blob creation/revocation, and zero orphan workers. The first context includes resize and live reduced-motion reattachment, explaining **44** cumulative targets rather than 11; ordinary scene views allocate **11**. Three kinds of teardown are covered: each scene transition, route exit/Back/refresh, and a delayed decoder parse completing after scene/route exit. The delayed scene case again has 4/4 workers, 4/4 blob URLs, a closed old bitmap and one live new context.

A separate resize case resizes 1280×900 →1024×768 →1280×900: same model/renderer, replaced framebuffer targets deleted, no extra decoder workers. A live reduced-motion toggle then releases **all** composer targets while keeping the model context alive; normal motion creates a new effects lease without refetching/reparsing the model. Mobile reduced-motion visits all eight scenes with **zero composer framebuffer/RT allocations**, no continuous frames and correct old-model disposal.

The report comes from Chromium **ANGLE/SwiftShader**, not a physical-GPU VRAM or frame-budget approval. Model geometry/material/texture/bitmap disposal is also checked exactly once across ten sequential same-URL leases. Renderer-owned residual allocations close with the context; only composer framebuffer/RT allocations are required to have individually matched pre-loss deletes. No universal one-to-one GL allocation/deletion claim is made for the whole renderer.

## Scroll/camera and browser evidence

The camera continues 5b's crane and .08 rad/s orbit; scene n≥2 starts at π/2+(n−2)×2 radians. All source durations in this batch are 25 seconds. Tests check continuous endpoints across all eight records, deterministic reverse sampling, actual progress increase and sticky top 0. Lenis remains active in normal motion and is destroyed on route exit.

Actual perspective-scene GPU `viewMatrix` uniforms (including the shared Sparkles shader) are sampled and inverted to camera position. Full-screen pass cameras are excluded explicitly; the verifier also requires indexed real-model drawing. Every transition's observed pose must match its crane/orbit target within **.03 world units**. This checks the actual rendered camera, not a shipped debug value. The real wheel trail contains intermediate positions; Back and refresh restore scene 3 at **scrollY 4496** with fresh actively drawing contexts.

The final run passes **20 named browser cases plus 16 measured transitions**, with **0 hydration and 0 unhandled browser errors**. Successful controlled-header rendering has 0 console errors. Expected direct-CORS/corrupt-model/unsupported-renderer failure messages are preserved separately, not hidden as successful rendering. Screenshots cover every normal scene and every mobile reduced-motion scene. Raw HTML shows one h1/noindex/noscript, with all eight narratives available without JS. Retry/empty/WASM/WebGL failure, negative selectors, consent and decoder cancellation cases stay green.

## Bundle cost and route isolation

The [controlled cost receipt](evidence/phase-5c/effects-cost.json) compares an eight-scene production build **before importing/instantiating effects** with this final eight-scene build. Both had the same pinned dependency declarations. It includes full raw receipts and baseline source hashes; it is not a sum of npm package sizes. Reproduce the control in a throwaway worktree using the final lock/dependencies but `ShowcaseCanvas.tsx` from the preceding scene-only commit `865934b`; the unreferenced effects files do not enter the graph. No runtime switch or firewall exception is needed.

| Async island                     |     JS bytes | Per-file gzip sum |
| -------------------------------- | -----------: | ----------------: |
| Eight scenes, no effects runtime |      753,443 |           203,351 |
| Eight scenes plus owned effects  |      926,865 |           290,914 |
| **Effects integration overhead** | **+173,422** |       **+87,563** |

That delta includes the wrapper, core effects, ownership integration, added Three code and chunk repartitioning. The published wrapper's barrel retains an **unused N8AO payload: 87,856 bytes /66,255 gzip**. No N8AO effect is mounted. A scoped Next `optimizePackageImports` experiment did not remove it and was reverted; no ineffective config change is shipped. This overhead is disclosed for review and 5e performance budgeting, not silently attributed only to bloom shaders. Remaining effects integration overhead after that payload is 85,566 bytes /21,308 gzip. No dependency-source patch or custom fork was introduced to trim it.

[Full emitted module/chunk receipt](evidence/phase-5c/bundle-receipt.json), with request proof in `report.json`:

| Fresh route            | HTTP |  JS bytes | Gzip bytes | Heavy chunks requested |
| ---------------------- | ---: | --------: | ---------: | ---------------------: |
| `/`                    |  200 |   915,903 |    291,205 |                      0 |
| `/vehicles`            |  200 |   437,161 |    131,603 |                      0 |
| `/showcase`            |  200 |   446,334 |    135,126 |                      0 |
| `/showcase/intro`      |  200 |   446,370 |    135,145 |                      0 |
| `/intro`               |  404 |   432,952 |    129,874 |                      0 |
| `/showcase/experience` |  200 | 1,372,584 |    425,648 |                      6 |

The real intro is `/showcase/intro`; literal `/intro` remains **404** and also loads no engine. All six heavy chunks load only on `/showcase/experience`. They are asynchronous experience assets, not additions to the lighter routes. Leva and r3f-perf each have **0 emitted production modules**.

| Heavy chunk                    | JS bytes | Gzip bytes |
| ------------------------------ | -------: | ---------: |
| `4570.c439261ba1eac63c.js`     |   17,824 |      6,929 |
| `9d78c252.954df95cd9526de9.js` |  518,276 |    128,192 |
| `b0045e08.21f4cdd8634adce5.js` |   77,565 |     18,077 |
| `d1830524.7c706078032c5a92.js` |   87,856 |     66,255 |
| `1329d575.685714fd1c99a513.js` |  109,698 |     33,957 |
| `1225.289cd1c35eeeeeaf.js`     |  115,646 |     37,504 |

These are emitted minified byte sizes and sums of per-file gzip, not Brotli transfer/LCP/TTI. Separate model/decoder bodies remain 603,908 +250,876 bytes. Downloaded JS can remain cached after leaving; mounted model/composer/worker state must be released. The selected source model/art and missing videos remain media-parity work.

## Local gate and unchanged surfaces

Real `npm ci --legacy-peer-deps`; no node_modules directory symlink. Web `.next`, untracked `next-env.d.ts` and incremental state were deleted before the final bare typecheck. Raw logs are committed beside the report.

| Command/check                                                      | Result                                                                                                      |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `npm run typecheck:all`                                            | PASS clean, including blocks/admin/web/workspaces                                                           |
| `npm run build --workspace=@lume/web`                              | PASS, unchanged boundary guard                                                                              |
| All `apps/web/checks/*.check.mjs` with tsx/react-server conditions | **78/78 PASS**: 74 extended existing +4 composer ownership checks                                           |
| `npm run verify:showcase --workspace=@lume/web`                    | PASS: 20 cases +16 measured transitions, direct R2 gate still open                                          |
| Existing `npm run build` (Vite)                                    | PASS                                                                                                        |
| `npm run check:migrations`                                         | PASS: 92 sequential files, no changes                                                                       |
| `git diff --check`                                                 | PASS                                                                                                        |
| Compiled graph and scoped credential scan                          | PASS: 114 JS files, 0 configured inherited credential matches; no client admin/db/rag/Leva/r3f-perf modules |
| Lockfile comparison                                                | PASS: all pre-existing entries preserved except added web requirements                                      |

The credential scan is limited to configured inherited values; no secret names/values are recorded and no universal secret-detection claim is made. Boundary graph enforcement remains the independent structural check. Root Vitest/admin build and branch GitHub CI have not been run/claimed for this unpublished slice; no SFTP test was changed or masked.

```sh
npm ci --legacy-peer-deps
rm -rf apps/web/.next
rm -f apps/web/next-env.d.ts apps/web/tsconfig.tsbuildinfo
npm run typecheck:all
npm run build --workspace=@lume/web
node --import tsx --conditions=react-server --test apps/web/checks/*.check.mjs
WEB_PREVIEW_R2_PUBLIC_BASE_URL='<existing public preview binding>' \
SHOWCASE_EVIDENCE_DIR='/tmp/lume-phase5c-evidence' \
npm run verify:showcase --workspace=@lume/web
git diff --check
```

The verifier runs a local production Next process with isolated loopback tenant/content fixtures and the real public R2 model bytes. It does not mutate staging tenant data, create tenants or call production Supabase. The system Chromium path can be overridden by `CHROMIUM_PATH`. This environment additionally used `NODE_USE_ENV_PROXY=1` and a test-process proxy-CA SPKI pin; no global browser-security settings changed.

## Review boundary and open gates

- **5c-2:** scenes 9–11 and the separate product-choice/scene-12/CTA phase. Their final state/navigation/asset semantics need a separate review; none are hidden in this batch.
- **5d:** actual audio implementation and consent-aware playback. The inherited bridge remains in place with disabled audio; no audio work started here.
- **5e:** hosted/direct R2 model proof, source-video/media decisions, lighting/bloom visual approval, physical iOS/Android GPU/performance and full parity. R2 still returns no ACAO for the Preview origin. Successful screenshots add the header in Playwright only; no hosted deployment or CORS configuration was touched.
- **Cost/latency:** repeated scene parses keep exclusive ownership and may show a loading fallback. Composer adds the measured payload and 11 active targets; half-float buffers, DPR cap and no MSAA bound choices but do not establish a physical-device budget. Target-size/memory tuning and the retained N8AO bytes need performance review before rollout.

Recommendation: **review this 5c batch's lifecycle and cost evidence; keep rollout gates open.** Preparing one draft PR titled **“Phase 5c — remaining scenes + postprocessing”** into staging requires Josh's push approval. No merge, deployment, traffic cutover, 5c-2 or 5d work follows without review.
