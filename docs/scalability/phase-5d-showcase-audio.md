# Phase 5d — showcase audio + polish

Application/evidence commit **`688178a56e6aa3b2d1762f229275214dedc76372`**, branch `feat/phase5d-showcase-audio`, based directly on staging **`4c41f3b1bc`**. This slice adds consent/gesture-gated, scene-owned HTML audio and mobile polish to the existing twelve-scene Next preview. No new runtime dependency, deployment, traffic cutover, database or remote configuration change.

**Local implementation/lifecycle gates pass; real soundtrack playback is still blocked on assets.** All four original Vite soundtrack keys return **404**. Josh explicitly approved **keeping the source keys, recording the missing-assets gate and using labelled test-only fixture proof**. Successful audio cases use a deterministic **two-second PCM test tone** supplied only by Playwright at those URLs; the app has no fallback tone, bundled soundtrack or fake successful playback. These are native media decode/lifecycle diagnostics, **not real soundtrack or hosted proof**.

Successful model screenshots continue using the exact real R2 GLB bytes with a **Playwright-only CORS response header**. Normal direct model fetch remains CORS-blocked. **Plain HTML audio needs no CORS**; missing audio files and hosted/device verification are separate from the model CORS gate. No bucket, proxy, autoplay-policy exception or firewall workaround was introduced.

## Source behavior and deliberate adaptations

`OutsideShowcaseMusic` in Vite intentionally returns null: its earlier short-whoosh ambient loop was removed. It remains disabled conceptually; **no audio was added to home, inventory, landing or intro**. No existing UI sound was repurposed as a soundtrack.

Vite `useShowcaseSceneMusic` supplies four looping groups, nominal volume **.28**, **5-second power2-out entry fade**, first-start delay 1.2 seconds and 3.5-second outgoing/crossfades. Next preserves the fixed grouping, loops, nominal volume and five-second cubic power2.out entry fade, implemented with an owned RAF rather than GSAP. Playback begins synchronously in the explicit trusted action so browser activation is available; it does not defer the play call behind Vite's timer. The outgoing scene is paused/unloaded immediately as requested, so **overlapping crossfades/delayed cleanup are not retained**. Adjacent scenes in the same group transfer only playhead/volume values into a new element; they never retain/share its native media resource. A new group restarts from zero. Non-seekable responses may start from zero rather than retaining time.

| Numbered scenes | Fixed source asset key       | Track |
| --------------- | ---------------------------- | ----: |
| 1–4             | `audio/showcase-track-1.mp3` |     1 |
| 5–8             | `audio/showcase-track-2.mp3` |     2 |
| 9–11            | `audio/showcase-track-3.mp3` |     3 |
| 12 / Product    | `audio/showcase-track-4.mp3` |     4 |

[Read-only source HEADs](evidence/phase-5d/source-audio.json): **404 for all four**, with no configuration/asset mutation. The actual browser attempt to track 1 reports `net::ERR_BLOCKED_BY_ORB`; the independent HTTP probe confirms 404. The UI displays a load failure and unloads the element. That browser failure is recorded, not mistaken for a CORS requirement or suppressed as successful playback.

## Server resolution and protected boundaries

New `server/showcase/audio-manifest.ts` is `server-only`, with fixed scene-ID→track and track→asset-key records. `showcaseAssets()` resolves audio alongside models from the existing **WEB_PREVIEW_R2_PUBLIC_BASE_URL**, using the **same unchanged origin-validation conditions**: HTTPS, no credentials/query/hash/control characters/backslashes. `media.ts` changes to return audio data, not to relax validation. No request/query/header/localStorage value chooses a URL or file key. Missing configuration returns null URLs and constructs no media.

Only public resolved URLs and numeric track IDs cross the client boundary. Tests verify the source groups, null configuration, malicious origin rejection and that a supplied extra URL selector is ignored. No new env binding or public/client env variable is added. The env firewall and boundary checker are **byte-for-byte unchanged**. All new native-audio code is explicitly client-only under `components/showcase/`; no new library or package/lock changes.

Core Three/Fiber/drei/Lenis/postprocessing pins, model/composer ownership, GLB policy/decoder, Next config, root Vite/admin/shared sources/build/deploy, origin allowlists and migrations are unchanged. No staging tenant or consent ledger was written by the evidence run; compliance posts are locally intercepted.

## Consent, gesture and choice contract

The existing tenant-local StoryProvider store is still installed explicitly in both DOM and R3F roots. Its audio stub is replaced by scalar status/track/enabled/preference/reason data; HTML elements never enter the store or React Flight. The mount-owned controller publishes into that same bridge.

- A real **Unmute audio** click must have `nativeEvent.isTrusted` and active browser user activation where that API exists, **and current consent must be accepted**. Element construction, src assignment and play happen only after that check.
- Consent acceptance alone, scroll, programmatic/synthetic clicks, storage events and rerenders cannot grant audio activation. Denied pre-consent clicks do not leave a pending activation to consume later.
- Mute/unmute choice persists under `lume.showcase-audio.v1:<tenant>`, isolated from other tenants and the root Vite UI-sound setting. **Saved-on is a preference, not permission**: every new experience mount/reload starts silent and needs a fresh trusted action, even with accepted consent. Blocked storage safely defaults off; the current visit still works.
- Reduced motion defaults off regardless of the saved preference. A deliberate unmute can opt into listening while the 3D view stays on demand. Turning reduced motion on during playback stops/unloads audio and clears activation; turning it back off does not silently resume.
- Consent revocation, page hiding/pagehide and incoming mute choices stop/unload immediately and clear activation. Returning to a page or receiving a saved-on change cannot resume it. Cookie preferences remain accessible through the **Audio consent** control.
- After explicit activation, new scene leases can continue that enabled visit. If a platform rejects a later native play call, the app releases it, shows a retry prompt and requires another trusted action. There are no retry/autoplay timers or swallowed play rejections.

Browser observations (`audioGates`, `audioMobile`, `audioPersistence`): pre-consent allocation/play **0/0**, consent-alone **0/0**, synthetic-click **0/0**; trusted consented enable produces a native element with **readyState 4**, advancing currentTime and a bounded fade. Saved-on after reload has **zero media elements** until another action. The accepted/rejected consent contract remains the existing shared banner and version; accepting it is deliberately separate from audio enable.

## Resource ownership and teardown proof

This uses **HTMLAudioElement, not Web Audio API**. No AudioContext, MediaElementAudioSourceNode, analyser or gain/source graph is created: observed AudioContext allocations are **zero** throughout, so there is no graph to close/disconnect. No `crossOrigin` attribute is set; opaque public media playback does not require ACAO. Adding analysis/Web Audio later would require an explicit CORS decision, not a workaround here.

Each scene owns **one detached media element at most**, even when its URL matches the previous group. Its lease owns metadata/error listeners, the pending play result and a cancellable RAF fade. On replacement/mute/revocation/reduced-motion/hide/unmount it:

1. Clears the lease before callbacks can observe it as current; cancels the fade callback.
2. Removes its two listeners and pauses the element.
3. **Removes src entirely**, then calls `load()` to abort/reset fetch/decode (not an empty src assignment that might fetch the document).
4. Ignores late resolved/rejected play promises from an old lease. No stale callback can restart audio or overwrite the new scene status.

DOM unmount cleanup is synchronous through a layout effect. Route proofs wait for the actual island teardown, not merely the URL update while Next is still loading. Continue → tenant Home stops all media and releases the renderer/composer; Back restores a fresh silent owner requiring another explicit audio action.

[Captured report](evidence/phase-5d/report.json): every prior element has **src=null, paused=true, readyState=0, listeners=0 and a load/reset call**. Unit clocks verify no pending fade callbacks after release, and late promises/errors cannot revive the resource. The test harness retains references only to inspect these disposed states; it is not shipped, and this is not a claim to measure browser-native GC/physical audio memory.

The following table joins the inherited real-GPU disposal audit with native media observations. “Released media” means every earlier element satisfies those unload checks; the current element is actually playing the labelled diagnostic tone. Framebuffer/RT deletion is required **while the context is live**, not merely via context destruction.

| Swap    | Framebuffers created / deleted live | RT textures attached / deleted live | Prior media released | Active media | Expected track | Workers created / terminated |
| ------- | ----------------------------------- | ----------------------------------- | -------------------: | -----------: | -------------: | ---------------------------- |
| 1 → 2   | 44 / 44                             | 44 / 44                             |                    4 |            1 |              1 | 4 / 4                        |
| 2 → 3   | 11 / 11                             | 11 / 11                             |                    5 |            1 |              1 | 6 / 6                        |
| 3 → 4   | 11 / 11                             | 11 / 11                             |                    6 |            1 |              1 | 8 / 8                        |
| 4 → 5   | 11 / 11                             | 11 / 11                             |                    7 |            1 |              2 | 10 / 10                      |
| 5 → 6   | 11 / 11                             | 11 / 11                             |                    8 |            1 |              2 | 12 / 12                      |
| 6 → 7   | 11 / 11                             | 11 / 11                             |                    9 |            1 |              2 | 14 / 14                      |
| 7 → 8   | 11 / 11                             | 11 / 11                             |                   10 |            1 |              2 | 16 / 16                      |
| 8 → 9   | 11 / 11                             | 11 / 11                             |                   11 |            1 |              3 | 18 / 18                      |
| 9 → 10  | 11 / 11                             | 11 / 11                             |                   12 |            1 |              3 | 20 / 20                      |
| 10 → 11 | 11 / 11                             | 11 / 11                             |                   13 |            1 |              3 | 22 / 22                      |
| 11 → 12 | 11 / 11                             | 11 / 11                             |                   14 |            1 |              4 | 24 / 24                      |
| 12 → 11 | 11 / 11                             | 11 / 11                             |                   15 |            1 |              3 | 26 / 26                      |
| 11 → 10 | 11 / 11                             | 11 / 11                             |                   16 |            1 |              3 | 28 / 28                      |
| 10 → 9  | 11 / 11                             | 11 / 11                             |                   17 |            1 |              3 | 30 / 30                      |
| 9 → 8   | 11 / 11                             | 11 / 11                             |                   18 |            1 |              2 | 32 / 32                      |
| 8 → 7   | 11 / 11                             | 11 / 11                             |                   19 |            1 |              2 | 34 / 34                      |
| 7 → 6   | 11 / 11                             | 11 / 11                             |                   20 |            1 |              2 | 36 / 36                      |
| 6 → 5   | 11 / 11                             | 11 / 11                             |                   21 |            1 |              2 | 38 / 38                      |
| 5 → 4   | 11 / 11                             | 11 / 11                             |                   22 |            1 |              1 | 40 / 40                      |
| 4 → 3   | 11 / 11                             | 11 / 11                             |                   23 |            1 |              1 | 42 / 42                      |
| 3 → 2   | 11 / 11                             | 11 / 11                             |                   24 |            1 |              1 | 44 / 44                      |
| 2 → 1   | 11 / 11                             | 11 / 11                             |                   25 |            1 |              1 | 46 / 46                      |
| 1 → 12  | 11 / 11                             | 11 / 11                             |                   26 |            1 |              4 | 48 / 48                      |
| 12 → 1  | 11 / 11                             | 11 / 11                             |                   27 |            1 |              1 | 50 / 50                      |

All 24 old contexts are lost, prior GPU buffer/program/texture deletes are observed, model bitmaps close, blob URLs/workers balance, and one new GL context remains. Media never overlaps across scene leases. First-context target counts include resize/reduced-motion cycling. Core model/composer logic is unchanged; source graph and typed schema are extended for audio only.

Thirteen added unit cases cover the server map/policy, actual consent/gesture latch, persistence/storage isolation, same-group replacement/playhead transfer, group reset, mute, revocation/regrant, reduced motion, hidden state/remote mute, late play completion, native denial/error, bounded fade and missing configuration. Existing tests remain green: **92 total**.

## Mobile polish and pacing

The scene selector becomes a horizontal strip on small screens rather than twelve wrapping rows. Active-scene centering changes **only horizontal scroll**, preserving Lenis and browser restoration. Scene/audio controls have **44px** minimum tap targets; Continue is a separated, 44px action. The footer stays within the mobile viewport. Audio status uses a polite live region and the toggle exposes pressed/busy state; no debug error/asset URL is shown in the UI.

At **390×844**, the document scroll width is **390**, the picker width **358** and its internal scroll width **1252**. Audio mute target measured **44px** high. Real touch interactions enable/mute, navigate to Product, continue to tenant Home and verify media teardown. All twelve reduced-motion views still allocate zero composer targets. Explicit listening does not turn the demand-rendered canvas into a continuous loop.

Short post-load requestAnimationFrame cadence samples on the experience route, Chromium **ANGLE/SwiftShader**, 1280×900, test devicePixelRatio 1 (configured DPR cap 1.5):

| Diagnostic | Interval samples | Median ms | p95 ms | Max ms | Intervals >50ms |
| ---------- | ---------------: | --------: | -----: | -----: | --------------: |
| audioOff   |               16 |     100.0 |  200.0 |  200.0 |              15 |
| audioOn    |               19 |      83.4 |  266.6 |  266.6 |              16 |

These are approximately 1.8-second sequential diagnostics with a synthetic PCM source, **not GPU timings or a controlled physical-device benchmark**. The 83.4–100ms median software-renderer cadence is not a smoothness/performance approval. Differences between these short sequential samples are not attributable to audio; warm-up and sample variability apply. Physical GPU/frame budgets, iOS/Safari volume/autoplay behavior, real MP3 decoding/loop seams and actual audible output remain 5e gates. The headless browser decodes/advances media but does not prove speaker output.

## Code-split/build receipt

[Full emitted client receipt](evidence/phase-5d/bundle-receipt.json), [comparison with merged 5c-2](evidence/phase-5d/bundle-comparison.json) and actual requests in `report.json`. No new runtime dependencies.

| Heavy async experience island |   JS bytes | Gzip bytes |
| ----------------------------- | ---------: | ---------: |
| Merged 5c-2                   |    822,679 |    220,384 |
| Audio + polish                |    828,020 |    222,097 |
| Delta                         | **+5,341** | **+1,713** |

| Fresh route            | HTTP |  JS bytes | Gzip bytes | Heavy chunks requested |
| ---------------------- | ---: | --------: | ---------: | ---------------------: |
| `/`                    |  200 |   915,859 |    291,188 |                      0 |
| `/vehicles`            |  200 |   437,121 |    131,579 |                      0 |
| `/showcase`            |  200 |   446,282 |    135,101 |                      0 |
| `/showcase/intro`      |  200 |   446,318 |    135,120 |                      0 |
| `/intro`               |  404 |   432,910 |    129,855 |                      0 |
| `/showcase/experience` |  200 | 1,273,687 |    356,806 |                      5 |

Fresh home/vehicles/showcase/intro routes request **zero engine chunks, audio files or play calls** and construct **zero media elements/AudioContexts**. Literal `/intro` remains 404. All five heavy chunks stay exclusive to `/showcase/experience`. Public URL strings may be serialized in showcase props; no media source is attached/fetched before authorization. Downloaded JS may stay cached after navigation; mounted media/GPU/worker state does not.

**Leva, r3f-perf, N8AO, unused React postprocessing wrapper and client admin/db/rag modules: zero emitted modules.** The scoped configured-credential scan finds zero inherited configured value matches across 114 JS files; it does not claim universal secret detection.

| Heavy chunk                    | JS bytes | Gzip bytes |
| ------------------------------ | -------: | ---------: |
| `9d78c252.eec5dc9b316a97e1.js` |  517,593 |    127,972 |
| `7655.6fabb6cec9e21f6a.js`     |  110,712 |     35,186 |
| `b0045e08.a242a15e58e924f1.js` |   66,151 |     16,071 |
| `1329d575.685714fd1c99a513.js` |  109,698 |     33,957 |
| `9d78c252.eec5dc9b316a97e1.js` |  517,593 |    127,972 |
| `7655.6fabb6cec9e21f6a.js`     |  110,712 |     35,186 |
| `b0045e08.a242a15e58e924f1.js` |   66,151 |     16,071 |
| `1329d575.685714fd1c99a513.js` |  109,698 |     33,957 |
| `7097.0c5512059b99bd8b.js`     |   23,866 |      8,911 |

Sizes are emitted minified/per-file gzip sums, not CDN transfer/Brotli/LCP metrics. Test tones and test headers exist only in the verifier. Neither is added to deployed assets or runtime behavior.

## Local gate and reproducibility

Real `npm ci --legacy-peer-deps`; no node_modules directory symlink. Before final standalone typecheck, web `.next`, untracked `next-env.d.ts` and incremental state were removed. Raw logs are committed alongside the report.

| Check                                                              | Result                                                                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck:all`                                            | PASS clean, all workspaces                                                                                          |
| `npm run build --workspace=@lume/web`                              | PASS, unchanged boundary guard                                                                                      |
| All `apps/web/checks/*.check.mjs` with tsx/react-server conditions | **92/92 PASS**                                                                                                      |
| `npm run verify:showcase --workspace=@lume/web`                    | PASS: **24 browser cases +24 scene swaps**, plus audio gates/pacing; real-assets/hosted gates remain open           |
| Existing Vite `npm run build`                                      | PASS; root source/build untouched                                                                                   |
| `npm run check:migrations`                                         | PASS: 92 sequential files, no changes                                                                               |
| `git diff --check`                                                 | PASS                                                                                                                |
| Protected-surface/compiled graph scan                              | PASS; env/boundary/Next/engine/root/admin/shared/package/lock/migrations unchanged; zero privileged/devtool modules |

Root Vitest/admin build and branch GitHub CI have not been run/claimed for this unpublished slice; no SFTP test was altered/masked. No production keys were required or printed, and no new binding was introduced.

```sh
npm ci --legacy-peer-deps
rm -rf apps/web/.next
rm -f apps/web/next-env.d.ts apps/web/tsconfig.tsbuildinfo
npm run typecheck:all
npm run build --workspace=@lume/web
node --import tsx --conditions=react-server --test apps/web/checks/*.check.mjs
WEB_PREVIEW_R2_PUBLIC_BASE_URL='<existing public preview binding>' \
SHOWCASE_EVIDENCE_DIR='/tmp/lume-phase5d-evidence' \
npm run verify:showcase --workspace=@lume/web
git diff --check
```

The verifier starts a local production Next process with isolated loopback tenant/content fixtures, real public R2 GLB bytes and the explicitly labelled PCM audio responses. It does not query production Supabase or mutate staging data. The direct missing-audio case uses real R2 without a tone response. System Chromium can be overridden with `CHROMIUM_PATH`; this environment used `NODE_USE_ENV_PROXY=1` and a test-process proxy-CA SPKI pin, with no global browser-security changes. No autoplay bypass flag or runtime fallback was added.

## Remaining gates and stop for review

- **Actual soundtrack assets:** all four original keys are 404. Owner-provided real tracks at those approved keys are required before claiming actual/hosted soundtrack playback. Current fixture decoder tests are not that proof.
- **Hosted model rendering:** R2 still omits ACAO for preview origins; owner-approved CORS and an unmodified hosted run remain 5e. Plain HTML audio does not need that header; future Web Audio/analysis would.
- **5e parity/devices:** source video/product-choice/timing/art, audible real tracks/codec/loop seams, native autoplay-policy behavior and physical GPU/mobile performance remain open. No 5e work or cutover was started.

The phase is ready for **local implementation/lifecycle review with those honest open gates**. One draft PR titled **“Phase 5d — showcase audio + polish”** into staging requires Josh's push approval. Stop afterward; do not merge, deploy or continue to 5e.
