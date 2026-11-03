# Phase 5c evidence

See [scope, methods, findings and open gates](../../phase-5c-showcase-effects.md).

**Successful model screenshots are local Playwright-only CORS-header diagnostics using the exact real R2 model bytes, not hosted rendering proof.** Direct browser failure is captured separately in `r2-cors-blocked.jpg` and `report.json`. No hosted deployment, CORS change, tenant mutation or traffic cutover occurred.

- `report.json`: exact app commit; 20 browser cases, 16 scene transitions, live-context GPU deletion counts, actual camera positions, resize/reduced-motion/Back/refresh/consent/cancellation observations.
- `bundle-receipt.json`, `no-effects-bundle.json`, `no-effects-source.json`, `effects-cost.json`: actual emitted client modules/assets and controlled effects-overhead calculation. `with-n8ao-bundle.json` preserves the historical wrapper/N8AO cost; final N8AO emitted modules are zero.
- `resolved-dependencies.json`, `source-assets.json`: exact resolved peer-compatible versions and read-only source asset availability.
- `scene-{1..8}-desktop.jpg`, `*-mobile-reduced.jpg`: all eight scene views, with per-scene model ownership and reduced-motion controls/copy.
- `showcase*.html`, `nojs-experience.jpg`: raw SSR noindex/one-h1/noscript output.
- `*-build.log`, `typecheck-all.log`, `web-checks.log`, `migrations.log`, `boundary-scan.json`, `verification.txt`: local gate receipts.
