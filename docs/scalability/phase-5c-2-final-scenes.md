# Phase 5c-2 — final scenes (9–12)

Application/evidence commit **`9ac4e45b8ecc804846e81816762c9e47b8702e91`**, branch `feat/phase5c-2-final-scenes`, based directly on staging **`65944fc713`**. All **12 numbered showcase scenes** are now present in the isolated Next preview. This completes the requested numbered scene set; it does not claim full Vite video/overlay/audio/visual parity. No 5d work, deployment, traffic cutover, database operation or remote configuration change was performed.

**Local gates pass; hosted/direct R2 model rendering remains a 5e gate.** Successful model screenshots use exact real R2 bytes with a **Playwright-only CORS response header**, not hosted success. Normal browser CORS failure is captured separately. No runtime proxy, origin-policy exception or bucket change was added.

## Source count and agreed closing behavior

[Source inventory](evidence/phase-5c-2/source-inventory.json): there are exactly **12 numbered `scene-N/content.ts` files**. Vite's main `showcaseScenes` array has **1–11**, followed by an unnumbered product-choice phase and a separate `Scene12` Product overlay. The other showcase chapters contain placeholder records, not additional numbered scenes in this chapter.

Josh explicitly confirmed this scope: **sequential scene 12 + Continue → Home**. The existing 5b/5c scroll path remains, and scene 12's tenant-aware Next link returns to `/?tenant=demo` in the proof. Its source text and authored duration are preserved; the unnumbered carousel/yes-no overlay, alternate ending and visual timing remain parity work. No missing carousel model assets, analytics or audio behavior was invented.

| New scene | Source title | Authored duration | Treatment                                                                           |
| --------- | ------------ | ----------------: | ----------------------------------------------------------------------------------- |
| 9         | Momentum     |              25 s | Final action/narrowing narrative, owned model + bloom                               |
| 10        | Statement    |              25 s | Product statement/flip cues, owned model + bloom                                    |
| 11        | Empty string |              25 s | Source title stays empty; **Scene 11** is a separate accessible UI/navigation label |
| 12        | Product      |          **20 s** | Final source copy, owned model + bloom, **Continue → tenant Home**                  |

All twelve metadata records are checked against the source text/duration/cues. Scene 11's title was not silently rewritten. `label` is server-constant and only supplies accessible headings/buttons when the authored title is blank; noscript uses the same label. Source imports exist only in check fixtures, never in the Next runtime.

The virtual camera clock retains .08 rad/s. Scenes 2–11 each cover two radians; scene 12 covers **1.6 radians**, joins scene 11 continuously and has its own GPU ownership. The source 20 seconds is preserved as authored metadata and camera-arc timing, **not a 20-second autoplay claim**: this player is scrubbed by scroll. Narrative pause/flip cues keep the established relative-weight mapping. The reserved height becomes **2500svh**: twelve equal two-viewport intervals plus the sticky viewport.

## Manifest, media and dependency cleanup

Four fixed IDs/asset keys extend `server/showcase/scene-manifest.ts`. IDs/keys never come from request selectors. **`server/showcase/media.ts` is unchanged**: same HTTPS/no credentials/query/hash/control-character/backslash origin policy. The embedded-only GLB validation, byte limits, redirect/credentials restrictions, self-hosted Draco and late-worker guard are unchanged. Legacy entry `part=6&chapter=0` remains supported; unknown/invalid/draft selectors still 404.

All twelve views use the existing **one distinct 603,908-byte catalog GLB URL** through separate scene-ID keyed leases. Parsed geometry/materials/textures are not shared or globally cached. No new art asset/model URL was fabricated. The final source video `video/showcase-scene-final-high.mp4` returns **404** on a read-only public HEAD ([observation](evidence/phase-5c-2/source-final-media.json)); complete source-video parity is still open. The real model SHA-256 is `de5b04647e34ff1c7496c19cd77ec1719dde671b8bdb4b57ae1ae4d672b944ce`.

The web runtime has no `@react-three/postprocessing` imports. Only the scoped boundary capability and a static boundary-check fixture mention it. This slice therefore removes **web's unused 3.0.4 declaration** and its **two scoped lock entries** (wrapper and nested maath). Every other prior lock entry is unchanged except web's dependency list. A real second `npm ci --legacy-peer-deps` validates the cleaned lock. The root Vite dependency declaration stays untouched; this is not a root dependency cleanup.

No new runtime dependencies. Core `postprocessing@6.38.0`, Three 0.164.1, Fiber 9.4.0, drei and Lenis remain pinned as before. **`ShowcaseEffects.tsx`, `composer-ownership.ts`, `ShowcaseCanvas.tsx` and all loader/resource/disposal modules are unchanged from 5c**: the same renderer-local bloom applies uniformly to all twelve views. Reduced motion unmounts the composer subtree, stops continuous frames and exposes all source copy with manual scene controls.

The env firewall, boundary checker and Next config are byte-for-byte unchanged. New client behavior is limited to the existing scoped showcase components. Root Vite/admin/shared source/build/deploy, migrations, origin allowlists and tenant data are untouched. No 5d audio work; the inherited state/consent/audio bridge remains in place with disabled audio.

## Every-scene transition and completion proof

[Raw browser report](evidence/phase-5c-2/report.json) records **24 transitions**: 1→2→…→12, 12→11→…→1, then 1→12→1 skips. Each sample requires a fresh actively drawing model context, validates the camera target, releases an old bitmap, balances workers/blob URLs, checks all earlier contexts lost and leaves exactly one live current context.

Framebuffer/attached render-target texture deletion is measured **while the context is live**, before `gl.isContextLost()` becomes true. Destroying the context cannot mask a composer leak. GPU buffer/program/texture deletions and any allocated renderbuffers are also checked. These are verifier-injected WebGL observations, not application telemetry.

| Sample | Transition | Framebuffers created / deleted live | RT textures attached / deleted live | Bitmaps closed | Workers created / terminated (cumulative) | Live contexts |
| ------ | ---------- | ----------------------------------- | ----------------------------------- | -------------- | ----------------------------------------- | ------------- |
| 1      | 1 → 2      | 44 / 44                             | 44 / 44                             | +1             | 4 / 4                                     | 1             |
| 2      | 2 → 3      | 11 / 11                             | 11 / 11                             | +1             | 6 / 6                                     | 1             |
| 3      | 3 → 4      | 11 / 11                             | 11 / 11                             | +1             | 8 / 8                                     | 1             |
| 4      | 4 → 5      | 11 / 11                             | 11 / 11                             | +1             | 10 / 10                                   | 1             |
| 5      | 5 → 6      | 11 / 11                             | 11 / 11                             | +1             | 12 / 12                                   | 1             |
| 6      | 6 → 7      | 11 / 11                             | 11 / 11                             | +1             | 14 / 14                                   | 1             |
| 7      | 7 → 8      | 11 / 11                             | 11 / 11                             | +1             | 16 / 16                                   | 1             |
| 8      | 8 → 9      | 11 / 11                             | 11 / 11                             | +1             | 18 / 18                                   | 1             |
| 9      | 9 → 10     | 11 / 11                             | 11 / 11                             | +1             | 20 / 20                                   | 1             |
| 10     | 10 → 11    | 11 / 11                             | 11 / 11                             | +1             | 22 / 22                                   | 1             |
| 11     | 11 → 12    | 11 / 11                             | 11 / 11                             | +1             | 24 / 24                                   | 1             |
| 12     | 12 → 11    | 11 / 11                             | 11 / 11                             | +1             | 26 / 26                                   | 1             |
| 13     | 11 → 10    | 11 / 11                             | 11 / 11                             | +1             | 28 / 28                                   | 1             |
| 14     | 10 → 9     | 11 / 11                             | 11 / 11                             | +1             | 30 / 30                                   | 1             |
| 15     | 9 → 8      | 11 / 11                             | 11 / 11                             | +1             | 32 / 32                                   | 1             |
| 16     | 8 → 7      | 11 / 11                             | 11 / 11                             | +1             | 34 / 34                                   | 1             |
| 17     | 7 → 6      | 11 / 11                             | 11 / 11                             | +1             | 36 / 36                                   | 1             |
| 18     | 6 → 5      | 11 / 11                             | 11 / 11                             | +1             | 38 / 38                                   | 1             |
| 19     | 5 → 4      | 11 / 11                             | 11 / 11                             | +1             | 40 / 40                                   | 1             |
| 20     | 4 → 3      | 11 / 11                             | 11 / 11                             | +1             | 42 / 42                                   | 1             |
| 21     | 3 → 2      | 11 / 11                             | 11 / 11                             | +1             | 44 / 44                                   | 1             |
| 22     | 2 → 1      | 11 / 11                             | 11 / 11                             | +1             | 46 / 46                                   | 1             |
| 23     | 1 → 12     | 11 / 11                             | 11 / 11                             | +1             | 48 / 48                                   | 1             |
| 24     | 12 → 1     | 11 / 11                             | 11 / 11                             | +1             | 50 / 50                                   | 1             |

Every old context has `lost=true`. The first context includes the inherited resize/reduced-motion cycling and therefore has 44 target allocations rather than the ordinary **11**. Each row accounts for all allocated composer framebuffers/RT textures before loss. Renderer-internal residual allocations close with the context; no claim is made that every renderer GL allocation has an individual explicit delete. The real model geometry/material/texture/bitmap checks also verify fourteen sequential same-URL leases; the real postprocessing-object checks cover pass removal ordering, mip targets, idempotent leases and late attachments.

The closing-action case selects scene 12, clicks the real Next **Continue** link and confirms **tenant Home**, all contexts lost, every composer target deleted live, workers terminated and no canvas retained. Back restores scene 12 and renders a fresh owned model. Other Back/refresh tests still restore scene 3. Continue is also present in the twelve-scene noscript output. No 3D success is required for the readable story/navigation/final action to remain available.

Inherited resize and live reduced-motion checks remain green. All twelve mobile reduced-motion views allocate **zero composer framebuffers/render-target textures**, stop continuous frames and dispose the previous model on manual scene selection. Decoder completion after scene/route cancellation remains covered. The screenshots include normal and mobile reduced-motion views for each of the twelve scenes, including the source-blank Scene 11 and final Product/Continue.

## Camera, rendering and browser evidence

The verifier samples actual perspective-scene GPU view uniforms (including shared Sparkles), excludes full-screen postprocessing cameras, reconstructs camera position, and requires it to match each scene's crane/orbit target within **.03 world units**. Indexed real-model drawing is independently required. The final scene expectation uses its **20-second /1.6-radian** arc, not a copied 25-second formula. Endpoints are also unit-checked across all twelve records.

Progress increases, Lenis produces intermediate real-wheel positions, the canvas stays sticky and Lenis cleans up on exit. The final run passes **21 named browser cases plus 24 measured swaps**, with **zero hydration and zero unhandled browser errors**. Successful controlled-header rendering has zero console errors; expected CORS/model/unsupported-renderer error messages remain separately captured. This is Chromium **ANGLE/SwiftShader** lifecycle proof, not a physical-GPU VRAM/frame-budget approval.

Raw HTML on all three showcase routes retains one h1, noindex and noscript. The JS-disabled experience contains all twelve narrative headings and the final tenant-preserving Continue link. Consent dispatch is intercepted locally, accepted/rejected choices are preserved and audio remains disabled; no remote consent/tenant write occurs.

## Build-audit receipt

[Full emitted receipt](evidence/phase-5c-2/bundle-receipt.json), [comparison to merged 5c](evidence/phase-5c-2/bundle-comparison.json) and real route requests in `report.json`. Sizes are minified emitted files/sums of per-file gzip, not Brotli transfer/LCP metrics.

| Heavy async island                 | JS bytes | Gzip bytes |
| ---------------------------------- | -------: | ---------: |
| Merged 5c, eight scenes            |  822,479 |    220,306 |
| Twelve scenes plus labels/Continue |  822,679 |    220,384 |
| Difference                         | **+200** |    **+78** |

| Fresh route            | HTTP |  JS bytes | Gzip bytes | Heavy chunks requested |
| ---------------------- | ---: | --------: | ---------: | ---------------------: |
| `/`                    |  200 |   915,861 |    291,174 |                      0 |
| `/vehicles`            |  200 |   437,121 |    131,576 |                      0 |
| `/showcase`            |  200 |   446,282 |    135,095 |                      0 |
| `/showcase/intro`      |  200 |   446,318 |    135,114 |                      0 |
| `/intro`               |  404 |   432,910 |    129,849 |                      0 |
| `/showcase/experience` |  200 | 1,268,346 |    355,087 |                      5 |

All five heavy chunks remain exclusive to fresh `/showcase/experience` loads. `/`, `/vehicles`, `/showcase`, `/showcase/intro` pull **zero**; literal `/intro` stays 404 with zero heavy requests. **Leva, r3f-perf, N8AO and the removed React wrapper each emit zero production modules**, enforced by the verifier. Loaded JS may stay cached after exit; mounted GPU/worker resources must not.

| Heavy chunk                    | JS bytes | Gzip bytes |
| ------------------------------ | -------: | ---------: |
| `9d78c252.eec5dc9b316a97e1.js` |  517,593 |    127,972 |
| `7655.6fabb6cec9e21f6a.js`     |  110,712 |     35,186 |
| `b0045e08.a242a15e58e924f1.js` |   66,151 |     16,071 |
| `1329d575.685714fd1c99a513.js` |  109,698 |     33,957 |
| `4570.67a58de0aa69f362.js`     |   18,525 |      7,198 |

## Full local gate

Real npm installs, no node_modules directory symlink. Before final bare typecheck, `.next`, untracked `next-env.d.ts` and incremental state were removed. Raw logs are committed beside the report.

| Command/check                                                      | Result                                                                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck:all`                                            | PASS clean; all workspaces                                                                                          |
| `npm run build --workspace=@lume/web`                              | PASS, unchanged boundaries                                                                                          |
| All `apps/web/checks/*.check.mjs` with tsx/react-server conditions | **79/79 PASS**                                                                                                      |
| `npm run verify:showcase --workspace=@lume/web`                    | PASS: 21 cases +24 swaps; hosted CORS remains open                                                                  |
| Existing Vite `npm run build`                                      | PASS; root source/build untouched                                                                                   |
| `npm run check:migrations`                                         | PASS: 92 sequential files, no migrations                                                                            |
| `git diff --check`                                                 | PASS                                                                                                                |
| Client graph/scoped credential scan                                | PASS: 114 compiled JS files, zero inherited configured credential matches and no privileged/devtool/wrapper modules |
| Lock cleanup                                                       | PASS: only unused web wrapper/two scoped entries removed; other entries unchanged                                   |

Credential scanning is limited to configured inherited values, not a universal secret-detection claim. No secret names/values were recorded. Root Vitest/admin build and branch GitHub CI have not been run/claimed for this unpublished slice; no SFTP test was modified or masked.

```sh
npm ci --legacy-peer-deps
rm -rf apps/web/.next
rm -f apps/web/next-env.d.ts apps/web/tsconfig.tsbuildinfo
npm run typecheck:all
npm run build --workspace=@lume/web
node --import tsx --conditions=react-server --test apps/web/checks/*.check.mjs
WEB_PREVIEW_R2_PUBLIC_BASE_URL='<existing public preview binding>' \
SHOWCASE_EVIDENCE_DIR='/tmp/lume-phase5c-2-evidence' \
npm run verify:showcase --workspace=@lume/web
git diff --check
```

The verifier starts a local production Next process using isolated loopback tenant/content fixtures and real public R2 bytes. It does not query production Supabase, create tenants, mutate staging data, change allowlists or deploy. System Chromium can be overridden with `CHROMIUM_PATH`; this environment additionally used `NODE_USE_ENV_PROXY=1` and a test-process proxy-CA SPKI pin, with no global browser-security changes.

## Remaining gates and review stop

The **numbered 1–12 set is complete** under the confirmed sequential scope. The unnumbered product-choice carousel/yes-no/alternate-ending overlay, source video/art/visual timing, audio implementation and physical-device/full visual parity remain 5d/5e work. No later-phase work was started. Scene transitions deliberately retain loading fallbacks and exclusive parses; no seamless-loading or device-performance claim is made.

**Hosted model-render proof is still open for 5e**: direct R2 requests omit ACAO, and normal browser model fetch fails. Successful screenshots use only the labelled Playwright response header. No CORS, runtime proxy, deployment or traffic cutover occurred.

One draft PR titled **“Phase 5c-2 — final scenes (9–12)”** into staging requires Josh's push approval. Stop for review afterward; do not merge, deploy or start 5d.
