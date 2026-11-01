# Phase 5 POC — one showcase scene in Next

**Recommendation: technically viable, with a CORS blocker before direct R2 playback can pass.** A real, Draco-compressed GLB renders in a Next App Router client island with R3F 9/drei 10, Lenis and a scroll-driven camera. Four asynchronous island chunks stay off home and vehicles. The controlled-header run has zero hydration, server/browser-global, page or console errors. Leva has zero emitted production modules.

**Direct R2 access is not proven successful.** Real GET responses return 200 without `Access-Control-Allow-Origin`; the normal browser correctly rejects the model. A second, explicitly labelled diagnostic uses the identical real bytes with one test-only CORS response header. That isolates the Next/WebGL question without claiming the media configuration gate passed. No R2 setting was changed.

This is a disposable spike based directly on staging `2f22f6f`, application commit `1dd1225a00bdbe44c8cab7633e4b17b3bdddd7c0`, branch `poc/phase5-showcase-island`. It is not the full Phase 5 port, a deployment, a traffic cutover or a candidate to merge as-is. The screenshots are a local production Next build with synthetic loopback tenant/content data and a **real public R2 model**, not a hosted Next Preview or fabricated remote tenant. Publication requires Josh's approval.

## What was ported

The source has 12 narrative content records, not 12 independent model scenes. `showcase/ShowcaseScene.tsx` currently renders only Sparkles. Scene 1 supplies the opening narrative; most of the broader experience lives in video switching, narrative/timeline hooks, story state, imperative overlays, music and choice phases. The scaffold `models/hero-product.glb` returned 404 during inspection.

The spike copies only scene 1's opening text and original Sparkles settings; it adds the existing product-catalog model `vehicle%20images/3D%20assets/blackredbull6.optimized.glb` to exercise real loading. It adapts the original `CameraRig`/`useScrollCamera` interpolation to scrub the original showcase crane waypoints `(-1.2, 0.8, 6.4) → (-0.3, 0.3, 5.6) → (0, 0.05, 5.2)`, FOV 48. It does **not** claim the entire GSAP chapter director, shake, timing or audio system was ported unchanged.

- The server `/showcase` route resolves the tenant and owns title/description/canonical/OG, one h1, navigation and noindex. It passes only the public model URL derived from `WEB_PREVIEW_R2_PUBLIC_BASE_URL`.
- A `"use client"` facade owns `next/dynamic(..., { ssr: false })`. WebGL, loader and Lenis imports live inside that asynchronous client island. No deep root `src/` imports are introduced.
- The disposable GLTF hook follows `useDisposableGLTF`: clone the scene and owned materials, preserve loader-owned geometry/textures, dispose owned materials on unmount. The cached model can remount on Back.
- Lenis and its RAF are route-local and destroyed on exit. Native/Next restoration remains in charge; no initial `scrollTo(0)` or global history restoration override.
- Reduced motion disables Lenis, freezes the camera's progress and Sparkles speed. A loading/WebGL/model-error fallback retains the server heading and working navigation.

The temporary `/showcase` placement follows this spike's request. The approved migration plan still calls for a crawlable showcase landing and a separate `/showcase/experience` player. This spike does not replace that permanent routing decision.

## The five proof points

| Requirement                                    | Result and evidence                                                                                                                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R3F + drei + real GLB in dynamic client island | **PASS in the controlled-CORS diagnostic**: two real meshes, 3 draw calls, 206,623 triangles, embedded WebP and Draco decode; zero hydration/SSR/page/console errors. Normal R2 loading remains blocked below |
| Lenis + rendered camera + Next routing         | **PASS locally**: wheel scroll changes actual camera coordinates; Link to vehicles destroys Lenis/unmounts canvas; Back and refresh both restore scrollY 1050; Home cleanup and reduced-motion case pass      |
| Code split                                     | **PASS**: actual emitted module/chunk receipt plus fresh browser network traces. No asynchronous island chunk on `/` or `/vehicles`; all four on `/showcase`                                                  |
| Direct preview-selected R2 with CORS           | **BLOCKED**: HTTP 200 /603,908 bytes, missing allow-origin for local and stable Preview origins; unmodified browser reports CORS failure. No production/bucket configuration changes                          |
| Leva excluded                                  | **PASS**: zero emitted Leva modules in the full production client compilation. No Leva imports or development panel were added; no client `process.env` exception                                             |

[Complete browser report](evidence/phase-5-poc/report.json), [module/chunk receipt](evidence/phase-5-poc/bundle-receipt.json), [raw server HTML](evidence/phase-5-poc/showcase.html), [verification record](evidence/phase-5-poc/verification.txt).

[Scrolled scene](evidence/phase-5-poc/scene-scrolled.jpg), [390×844 reduced-motion view](evidence/phase-5-poc/scene-mobile-reduced.jpg), [normal browser CORS fallback](evidence/phase-5-poc/r2-cors-blocked.jpg). The successful rendering screenshots are the **controlled-header** run; they are not presented as direct R2 success. The model's dark source materials are retained; this is not a lighting/visual-parity approval.

The HTML includes Next's intentional `ssr:false` client-render bailout marker and the reserved loading frame. That expected boundary marker is not a hydration failure. Server content is present without JavaScript; the canvas is created only in the client.

## Measured payload

These are actual emitted minified file sizes and the sum of per-file Node gzip sizes, **not** claimed CDN transfer sizes, Brotli sizes, LCP or physical-device performance measurements. Fresh Chromium contexts loaded each route; the showcase's initial measurement is taken before the separate exit/back/refresh lifecycle journey.

| Initial route |  JS bytes | Sum gzip bytes | Async island chunks requested |
| ------------- | --------: | -------------: | ----------------------------: |
| `/`           |   915,611 |        291,043 |                             0 |
| `/vehicles`   |   436,988 |        131,486 |                             0 |
| `/showcase`   | 1,361,176 |        379,884 |                             4 |

The **full async island** is **915,829 bytes /245,526 gzip bytes**. This includes the private R3F React reconciler and the local scene implementation, not only Three/Lenis. The renderer/loader/Lenis subset alone is 802,377 /209,749 bytes. The showcase facade/ordinary Next runtime are counted in the initial route total above.

| Async chunk                    |   Bytes | Gzip bytes |
| ------------------------------ | ------: | ---------: |
| `933.5d511185d0ccee69.js`      | 137,489 |     42,967 |
| `9d78c252.0b82453246187003.js` | 664,888 |    166,782 |
| `1329d575.534506555cef1d4c.js` | 109,697 |     33,956 |
| `653.fc70ded94ef2c827.js`      |   3,755 |      1,821 |

The GLB adds **603,908 bytes**. Its distinct Draco decoder resources add **58,916 bytes JS +283,091 bytes WASM** as decoded bodies from gstatic (both HTTP 200); they are separate from webpack totals. The model has no external image URI. Diagnostic interception disables ordinary cache behavior, so repeated lifecycle requests are not a cache-efficiency benchmark. Loader caches and already downloaded JavaScript can remain after leaving the route; the proof is that fresh ordinary routes do not request the island and its canvas/Lenis lifecycle cleans up.

The existing home payload remains substantial. This spike proves exclusion of the 3D island, not that the broader shared content/form/motion bundle is already optimized.

## Integration findings

1. **React versions:** Vite retains R3F 8/React 18; web uses scoped R3F 9.4.0/drei 10.7.7/React 19.2.6. Three remains the existing 0.164.1, matching declared peers; `@types/three` is aligned to the existing 0.164.1. A stale duplicate 0.164.0 type tree exposed excessive structural type comparison; aligned pins and a truly clean npm install resolve it without casts/skip directives. Every pre-existing lockfile package entry stays unchanged; the lock adds only web dependencies and the web manifest delta.
2. **Inherited CSS affects cameras:** the shared stylesheet locks html overflow and body becomes an unintended sticky scroll container. A `:has(.showcase-poc)` reset in the new route's CSS restores normal viewport scrolling only while this route exists. It stops matching on exit; no Vite/shared stylesheet changed.
3. **Lazy geometry affects restoration:** a one-screen placeholder followed by a 260svh scene caused refresh scroll anchoring to jump. The SSR/dynamic fallback now reserves the final scene height. Back and refresh retain the expected offset with the camera responding to that restored position.
4. **CORS is configuration, not a Next hydration defect:** direct GETs succeed outside browser enforcement but cannot be consumed by the browser. The public model is real, compressed and renderable. The owner must arrange CORS-enabled preview media (or approve an appropriate narrow media configuration update); this task did not change the shared public bucket or substitute a server proxy.
5. **Source scope matters:** the 12 narrative records conceal coupling to story state, background-video pause points, audio, imperative roots, choices and analytics. This one model/spatial path does not validate those systems or Vite GLSL include expansion.

## Firewall, boundaries and local gate

`apps/web/config/environment.ts` is byte-for-byte unchanged. No model/signing/Supabase credential is passed to the browser; only the public media URL is serialized. No `NEXT_PUBLIC_*`, VITE, generic production binding or test-mode exemption was added.

The boundary checker adds a **scoped capability**, not a global runtime whitelist entry: only explicitly `"use client"` files under `components/showcase-poc/` may import the four required 3D/scroll packages. Server files, other client surfaces, shared packages and helpers without that directive remain rejected. Negative checks prove server→client, client→server/config, unrelated-package and Leva rejection still operate. The build audit plugin only writes a receipt under ignored `.next/analyze`; it does not change externals, aliases, optimization or chunk splitting.

| Gate                                                                             | Result                                                                                                 |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Real clean `npm ci --legacy-peer-deps`                                           | PASS; no node_modules directory symlink                                                                |
| `npm run typecheck:all`                                                          | PASS after deleting web `.next`, `next-env.d.ts` and incremental state                                 |
| `npm run build --workspace=@lume/web`                                            | PASS including boundary guard                                                                          |
| `node --import tsx --conditions=react-server --test apps/web/checks/*.check.mjs` | **58/58 PASS** (55 existing +3 showcase checks)                                                        |
| `npm run verify:showcase --workspace=@lume/web`                                  | PASS for local rendering/navigation/isolation assertions; direct R2 CORS deliberately recorded as open |
| Existing root `npm run build`                                                    | PASS                                                                                                   |
| `npm run check:migrations`                                                       | PASS, 92 sequential files; no migrations created/applied                                               |
| `git diff --check`                                                               | PASS                                                                                                   |
| Compiled credential scan                                                         | PASS, 138 server/client outputs with zero inherited configured credential value matches                |

No changes to Vite `src/`, root package manifest/build/deployment config, admin or shared packages. Root Vitest/admin build and branch GitHub Actions were not run/claimed for this spike. No SFTP test change or masking. No remote tenant/configuration, chat/lead/session, production deployment or R2 mutation. No hosted Next deployment was attempted.

## Full-showcase estimate and review decision

**GO for planning an isolated client player; NO-GO for shipping this spike or claiming all five gates closed.** Direct R2 CORS must pass in an unmodified browser before rollout. Physical iOS Safari/Android testing is also required: this proof uses software ANGLE/SwiftShader, not hardware/mobile performance.

For the complete existing experience, budget **8–12 engineer-days including device QA**, excluding new creative content/model production and owner provisioning wait. The original Phase 5 plan's 4–7 days is an optimistic implementation-only case. This is an estimate from one narrow port and source inspection, not a proven delivery schedule:

| Work remaining                                                                                 |  Estimate |
| ---------------------------------------------------------------------------------------------- | --------: |
| Turn this into a reusable isolated player and retain a separate SSR landing                    | 0.5–1 day |
| Full camera/director, entry query validation/bookmarks, chapter state and restoration          |  2–3 days |
| Narrative/video pause points/audio unlock, choice phases, overlays/story/analytics integration |  2–3 days |
| Asset inventory/CORS/decoder ownership, shader/material/lighting validation and cleanup        |  1–2 days |
| Safari/Android, keyboard/reduced motion, repeat navigation and media/GPU memory/performance QA |  2–3 days |

Some items overlap; prioritize an actual target-device pass and valid asset URLs before committing to visual parity across all 12 content records. Do not multiply this small model scene by twelve or treat the unported GSAP/audio/shader systems as already proven.

The next authorized action is owner review of this disposable result and its draft PR. Publishing the prepared branch/PR requires Josh's approval; merging, changing CORS, deploying or starting the full showcase port is not authorized by this evidence.
