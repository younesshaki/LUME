# Phase 5d evidence

See [implementation, methods, metrics and open gates](../../phase-5d-showcase-audio.md).

**Audio successes use test-only PCM tone responses at the four missing R2 source keys; these are not actual soundtrack/hosted proofs.** Model successes use real R2 GLB bytes with Playwright-only CORS headers. No tone/header fallback is shipped in the app. Josh approved keeping source keys with labelled fixture proof and the missing-assets gate.

- `report.json`: exact app commit; 24 browser cases/24 scene swaps; native media before/after gates; currentTime/readyState; disposed src/listeners/load state; mobile touch/persistence; actual 404/ORB; RAF pacing.
- `source-audio.json`: real read-only HEADs, all four keys 404.
- `bundle-receipt.json`, `bundle-comparison.json`: actual emitted graph/chunks, +5,341 JS/+1,713 gzip versus merged 5c-2; no engine/media on light routes.
- `audio-mobile-reduced-on.jpg`, `audio-mobile-product.jpg`: explicit manual audio with reduced-motion static canvas and mobile controls. These use the labelled tone fixture.
- `scene-{1..12}-desktop.jpg`, `*-mobile-reduced.jpg`: each scene with the audio toolbar; main normal transitions run audio, reduced-motion defaults off.
- `showcase*.html`, `nojs-experience.jpg`, `r2-cors-blocked.jpg`: server/no-JS content and normal model-CORS failure.
- `*-build.log`, `typecheck-all.log`, `web-checks.log`, `migrations.log`, `boundary-scan.json`, `verification.txt`: local gate receipts.

The test harness intentionally retains media references to inspect unload state; it is not app code or a browser GC/physical audio-memory measurement. Web Audio allocations are zero by design.
