# Phase 5c-2 evidence

See [scope, methods, full transition table and limits](../../phase-5c-2-final-scenes.md).

**Successful model screenshots are local Playwright-only CORS-header diagnostics using exact real R2 bytes, not hosted rendering proof.** Normal direct failure is recorded separately. No deployment, remote configuration/tenant mutation or traffic cutover occurred.

- `report.json`: exact application commit, 21 browser cases, 24 transition samples, actual camera poses, pre-context-loss GPU/target deletion, final Continue/Home teardown and restoration.
- `bundle-receipt.json`, `bundle-comparison.json`: emitted module/chunk receipt and +200 JS/+78 gzip versus merged eight-scene 5c; no heavy chunks on lighter routes, no wrapper/Leva/perf/N8AO modules.
- `source-inventory.json`, `source-final-media.json`: exactly 12 numbered source scenes, confirmed sequential completion scope, source final-video availability.
- `scene-{1..12}-desktop.jpg`, `*-mobile-reduced.jpg`: each normal/reduced-motion scene. The source-blank title uses the accessible label **Scene 11**.
- `showcase*.html`, `nojs-experience.jpg`: raw noindex/one-h1/noscript content, all twelve narratives and closing action.
- `*-build.log`, `typecheck-all.log`, `web-checks.log`, `migrations.log`, `boundary-scan.json`, `verification.txt`: local gate receipts.
