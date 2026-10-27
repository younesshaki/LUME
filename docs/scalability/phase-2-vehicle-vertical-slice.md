# Phase 2 — vehicle vertical slice

This implements Phase 2 of [the approved migration plan](nextjs-migration-plan.md), branching from staging `be09b98` after PR #95 merged. It is an isolated, read-only Next preview, not a traffic migration. Root Vite, admin, their deployment settings, the root manifest/lockfile, existing API sources and all migrations are unchanged. The POC remains a reference only. Phase 3 has not started.

## Implemented scope

- `/vehicles/[vehicleId]` preserves the legacy UUID path. Server HTML contains the tenant/vehicle title, description, canonical, Open Graph photograph/text, one h1, complete gallery, specs, estimated price and availability CTA. Metadata and body use the same request-memoized loader. Next metadata streaming is blocked for all user agents. Canonicals keep the approved preview tenant selector and discard tracking inputs.
- `/vehicles` renders the initial inventory, GET search/filter form, counts and pagination without JavaScript. The loader supports the existing search/filter/sort parameters, a 200-item API maximum, limit-plus-one `hasMore`, exact optional counts, deterministic ID tie-breaks, null-mileage filtering and missing-search-vector fallback. Inventory canonicals preserve supported filters/pagination instead of pointing every page to page one. All preview routes remain noindex.
- Three compatible public read transports: `/api/vehicles`, `/api/vehicles/[id]`, `/api/vehicles/facets`, including OPTIONS, invalid-ID 400, unknown/foreign vehicle 404, tenant-scoped ETag/304, ordered images and embedded `priceSignal`. Facets remain a static route ahead of the UUID route; an older-schema facet scan paginates rather than silently truncating at Supabase's first 1,000 rows.
- Both transports and SSR call one server-only repository directly; SSR does not HTTP-fetch its own API. It uses existing read-only PostgREST RPCs and anonymous RLS, explicit tenant/status filters and a DTO-level tenant/visibility check. No new runtime dependency, schema, seed, metering write or database migration.
- Optional gallery lightbox and vehicle-scoped concierge entry are click-loaded client islands. They render nothing until hydration, leaving no inactive buttons when JS is off. Native image links and horizontally scrollable server photographs remain available. **The concierge entry is deliberately not connected to a provider (Phase 4). The public vehicle schema has no configured vehicle-model asset; no model is fabricated or substituted from the product catalog. A 3D-unavailable message stays in the optional client leaf; actual viewer/decoder/cinematic integration remains Phase 5.** Neither tool gates content, contact or LCP.
- The availability CTA is a native anchor. Its dealer link opens the existing **staging Vite** contact route via a full document navigation, preserving tenant and vehicle reference. No contact page, lead form or visitor bridge is migrated here. An unset destination produces an explicit read-only fallback, never a fabricated email/phone or a submission button.

## Data, price, sold and media policy

Only active tenants resolve. Detail and inventory expose only `live` vehicles. Sold/draft/archived/missing/cross-tenant detail requests are real HTTP 404s, matching the current public API's live-only policy; sold vehicles have no stale price offer. No structured Offer schema is emitted for estimated prices. Finite positive prices retain `Est. $…`; null/zero/negative/invalid prices show “Contact for price,” never `$0` or `NaN`. Missing mileage/specs are explicit.

Gallery order is primary first, then sort order and creation time. Managed R2 images win; unavailable/empty managed metadata falls back to deduplicated HTTPS legacy/feed photographs (up to 50). A missing `feed_image_urls` column retries the legacy projection. Invalid/credential-bearing media URLs are omitted; no image is fabricated. Empty media shows a visible “Photos coming soon” fallback. Price-signal RPC failure disables the signal without breaking the page. Data outages produce a sanitized API 503 or a retryable page error, rather than a false 404 or raw database error.

Staging's anonymous image read works for the demonstrated vehicle. The optional staging service binding, if later supplied, can read exact tenant/vehicle image metadata only **after** anonymous vehicle visibility is established. No such privileged binding is configured in this deployment. This does not establish production's gallery RLS parity.

## Isolation and preview bindings

Phase 1 host trust, request-local tenant memoization, forwarded-host rules and production-project denial remain. Public vehicle APIs alone now accept their existing `X-Lume-Tenant` selector on approved hosts; conflicting header/query/host selectors are rejected. Pages continue rejecting caller tenant headers, and `X-Web-Tenant` is always forbidden. Vercel's previously accepted forwarded-host normalization remains the platform contract.

All HTML/Flight/API data is private/no-store; no shared preview cache is introduced. APIs retain their JSON contracts and ETags, with intentional preview hardening: same-origin or explicitly allowlisted CORS, private caching instead of a shared CDN TTL, and sanitized 503 on upstream failure. They do not read, create, clear or forward visitor cookies to Supabase. The existing visitor/cookie transports remain owned by Vite/admin; their original contract tests are rerun unchanged.

The original [23-variable mapping](phase-1-web-foundation.md#full-current-vite-mapping) remains the reference. Three additive web-only names are documented in `.env.example`:

| Binding                                                                                | Scope and behavior                                                                                                                   |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `WEB_PREVIEW_SUPABASE_URL`, `WEB_PREVIEW_PROJECT_REF`, `WEB_PREVIEW_SUPABASE_ANON_KEY` | Existing isolated staging identity/data bindings; no browser database client and no generic Supabase fallback                        |
| `WEB_PREVIEW_DEFAULT_TENANT`                                                           | Existing approved-preview default `demo`; host/selector validation still applies                                                     |
| `WEB_PREVIEW_R2_PUBLIC_BASE_URL`                                                       | Explicit public media origin; server constructs image URL props from **staging-returned** keys. Never inherits generic `R2_*` values |
| `WEB_PREVIEW_CONTACT_URL`                                                              | Explicit existing staging Vite `/contact` destination; link only, no HTTP request during SSR                                         |
| `WEB_PREVIEW_ALLOWED_ORIGINS`                                                          | Optional exact external read-API origins; unset in this deployment, same-origin works automatically                                  |

The deployed project has six application bindings, all Preview-only; production-target binding count is zero. No service-role, AI, R2 signing, visitor, GitHub or Vercel credential is added to it. [Actual binding audit](evidence/phase-2/environment-audit.json) compares the decrypted project values to the supplied secure staging bindings in memory and records only names, project refs and booleans. Generic production/provider bindings are dropped by the launcher and rejected by the runtime guard. The compiled-output scan also checks actual inherited credential bytes, including the staging key, without printing them.

## Exit-gate evidence

Evidence below is captured from a production Next build and the isolated Vercel Preview. Staging has **one** active tenant, `demo` (`2de52a45-bc2b-451c-994c-02208b994e26`), with approximately 1,173 vehicles. No second tenant was created. The real staging sample is vehicle `16b46448-d5d0-441f-a329-397ec236a1a1`, **2023 Ferrari 812 GTS**, price **$392,500**, mileage **2,991**. Data reflects capture time, not a frozen fixture.

### Hosted Preview and raw response

[Open the real vehicle preview](https://lume-web-preview-205wpfnwb-hakicsi89-5044s-projects.vercel.app/vehicles/16b46448-d5d0-441f-a329-397ec236a1a1?tenant=demo). Deployment `dpl_2n4oVAJoEwEXJfWGzoS5K54eft5w` is READY with Vercel target `staging` (its API name for non-production Preview), source `611e34a857e43a1c82303d9d9b5d23f0d1d3ab62`. Later documentation-only commits do not change deployed application code. No customer domain is assigned.

```sh
curl -sS -D headers.txt 'https://lume-web-preview-205wpfnwb-hakicsi89-5044s-projects.vercel.app/vehicles/16b46448-d5d0-441f-a329-397ec236a1a1?tenant=demo' -o vehicle.html
```

[Verbatim HTML](evidence/phase-2/vehicle.html) is 15,766 bytes. [Headers](evidence/phase-2/vehicle.headers.txt) show HTTP 200, `X-Robots-Tag: noindex, nofollow, noarchive` and `Cache-Control: private, no-store, max-age=0`. These tags occur in the initial `<head>`, before any JavaScript execution; visible price/specs are in the body:

```html
<title>2023 Ferrari 812 GTS | LUME Demo</title>
<meta
  name="description"
  content="2023 Ferrari 812 GTS at LUME Demo. Est. $392,500. View photos, specifications and availability."
/>
<link
  rel="canonical"
  href="https://lume-web-preview-205wpfnwb-hakicsi89-5044s-projects.vercel.app/vehicles/16b46448-d5d0-441f-a329-397ec236a1a1?tenant=demo"
/>
<meta property="og:title" content="2023 Ferrari 812 GTS | LUME Demo" />
<meta
  property="og:description"
  content="2023 Ferrari 812 GTS at LUME Demo. Est. $392,500. View photos, specifications and availability."
/>
<meta
  property="og:url"
  content="https://lume-web-preview-205wpfnwb-hakicsi89-5044s-projects.vercel.app/vehicles/16b46448-d5d0-441f-a329-397ec236a1a1?tenant=demo"
/>
<meta
  property="og:image"
  content="https://pub-da3069790c6443f883e3991be965f766.r2.dev/demo/vehicles/16b46448-d5d0-441f-a329-397ec236a1a1/3cce3110-827e-40d9-bb52-1db95b598d2d.png"
/>
<meta property="og:image:alt" content="2023 Ferrari 812 GTS" />
<meta property="og:type" content="website" />
<h1>2023 Ferrari 812 GTS</h1>
<p class="price">Est. $392,500</p>
<div><dt>Mileage</dt><dd>2,991 miles</dd></div>
```

The [full extracted tags/specs](evidence/phase-2/raw-excerpt.txt), [raw Flight](evidence/phase-2/flight.txt) and [inventory HTML](evidence/phase-2/inventory.html) are committed too. All raw payloads were scanned for actual inherited credential values. Headers retain original status/values with CRLF and trailing whitespace normalized for Git.

| Exit gate                                                               | Concrete proof                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| JS-off metadata and content — **proven**                                | Raw HTML/head above plus JS-disabled Chromium: one h1, $392,500, 2,991 miles, gallery and native availability/contact links                                                                                                                                                                                                                                                    |
| Cross-tenant 404 — **proven with the single-tenant staging limitation** | 36 real-server fixture requests below; active beta gets document/API 404 for alpha's UUID. Hosted unknown-tenant document/API and conflicting public header/query return 404 without Ferrari data: [raw rejection](evidence/phase-2/unknown-tenant.html), [API body](evidence/phase-2/conflicting-selector.json), [headers](evidence/phase-2/conflicting-selector.headers.txt) |
| Existing public API contracts and cookies — **proven**                  | Original 9 files / 18 tests pass unchanged; 8 new web checks cover DTO/filters/visibility/fallback/CORS/ETag/cookie behavior. Hosted detail/inventory/facets and header-only selector return 200, HTTPS OPTIONS returns 204, invalid UUID 400 and POST 405                                                                                                                     |
| R2 photograph loads — **proven**                                        | [Actual HEAD](evidence/phase-2/r2-image.headers.txt): 200, `image/png`, 1,874,719 bytes. [Browser result](evidence/phase-2/mobile-proof.json): decoded image 1448 × 1086, zero media failures                                                                                                                                                                                  |
| Usable mobile without chat/3D — **proven**                              | JS disabled, viewport 390 × 664, native CTA reaches availability/contact, no page overflow, zero model/chat requests, no canvas; [screenshot](evidence/phase-2/mobile-js-off.png). JS-on smoke also opens/closes the lazy lightbox and vehicle-context chat-entry dialog with zero browser errors                                                                              |
| Staging isolation / no production credentials — **proven**              | [Binding audit](evidence/phase-2/environment-audit.json): only staging `hapyyupeugxccofpibor.supabase.co`, exact secure binding matches, six Preview-only names, zero production targets/generic bindings. Compiled-output and raw-payload credential scans pass                                                                                                               |

[Hosted HTTP results](evidence/phase-2/hosted-results.json) record all 16 checks. Unknown Host is rejected at Vercel's edge with `DEPLOYMENT_NOT_FOUND` (its platform 404 does not have application headers). Injected forwarded-host is normalized by Vercel; its HTML is byte-identical to the normal page, with the verified preview canonical unchanged. This is the accepted Phase 1 anti-spoofing criterion, not a claim that the platform returned 404.

The hosted preflight check found a Vercel detail that local tests could not expose: the internal `Request.url` may use HTTP behind the public HTTPS edge. The adapter now compares Origin to the validated public Host with HTTPS on Vercel; it does not trust caller `X-Forwarded-Proto`. A regression test and the corrected deployment's actual 204/CORS headers prove the fix.

**R2 CORS rollout gate:** this image response has no `Access-Control-Allow-Origin` for the preview Origin. Ordinary cross-origin `<img>` loading works and is proved. Future fetch-based GLB/textures, canvas use and model decoders must pass actual-origin CORS before rollout; no R2 policy or same-origin media proxy is changed in Phase 2.

### Actual function budget and live-project audit

[Actual deployment `lambdas[].output` manifest](evidence/phase-2/functions.json): **6 output records / 5 distinct function identities**, leaving **7 of 12** Hobby slots. One identity is listed twice for aliases; even counting every record leaves six slots. This measurement supersedes adding source-route counts. No image-optimization, OG-generation or sitemap function is added. Recount at every later route slice.

[Before/after live-project snapshots](evidence/phase-2/live-projects-unchanged.json) prove root/build/install settings, binding-name/target metadata and production deployment IDs are unchanged for `lume` and `lume-admin`. Their existing Git integrations created feature-branch jobs on push; unchanged ignore rules canceled those jobs before serving. The latest-job pointer consequently moved to a canceled job, not a live release. No existing-project API mutation, customer alias, domain or DNS action was performed.

Local cross-tenant production-server evidence is [vehicle-isolation.json](evidence/phase-2/vehicle-isolation.json): 36 alternating/concurrent HTML, Flight and JSON requests, with two **local deterministic active-tenant fixtures**. Alpha owns the vehicle; beta requests the same UUID. Alpha document/API return 200; beta document/API return real HTTP 404. Flight uses Next's normal HTTP 200 stream carrying `NEXT_HTTP_ERROR_FALLBACK;404` for beta and contains no foreign vehicle data. Gallery metadata is queried only after visible ownership (18 alpha reads; zero beta reads). This proves the active-other-tenant path without fabricating remote staging tenants. The real hosted negative selector test proves rejection, not a second real active-tenant comparison.

## Verification and reproduction

Full command output summaries: [verification.txt](evidence/phase-2/verification.txt). The existing-app suite is **not wholly green**:

| Command                                                  | Result                                                                                                                                                                                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run typecheck:all`                                  | Passed                                                                                                                                                                                                                                                       |
| `npm test -- --run`                                      | 293 files passed / 4 failed; 2,325 tests passed / 4 timeout failures, plus SFTP cleanup hook timeout                                                                                                                                                         |
| Four failing files, `--maxWorkers=1 --testTimeout=30000` | 23 tests passed / 1 failed: only the known SFTP size-cap case remains (own 20-second timeout instead of expected 25 MB rejection). Page-editor journey, legacy VDP fallback and credential-output harness pass. No unrelated source/assertion/config changes |
| `npm test -- --run tests/api api/_tests --maxWorkers=1`  | 9 files / 18 tests passed, including public detail/price signal, inventory cache contracts, visitor cookie/proxy, chat/leads/consent                                                                                                                         |
| `npm run build`                                          | Passed; existing Sass/large-chunk warnings                                                                                                                                                                                                                   |
| `NODE_USE_ENV_PROXY=1 npm run build:admin`               | Passed; existing middleware convention warning                                                                                                                                                                                                               |
| `npm run check:migrations`                               | Passed: 92 sequential files; none applied                                                                                                                                                                                                                    |
| `npm run build:web`, `npm run typecheck:web`             | Passed                                                                                                                                                                                                                                                       |
| Web `test:foundation`, `test:vehicles`                   | 7 + 8 passed                                                                                                                                                                                                                                                 |
| Web `verify:foundation`                                  | Alternating HTML/Flight, 20 concurrent requests, 12 forged/unknown selectors and actual-process credential isolation passed                                                                                                                                  |
| Web `verify:vehicles`                                    | 36 real-server requests passed as described above                                                                                                                                                                                                            |
| Compiled credential scan                                 | 107 compiled server/client files passed                                                                                                                                                                                                                      |
| `git diff --check`                                       | Passed                                                                                                                                                                                                                                                       |

Use secure process bindings; do not create dotenv files or copy production values. From repository root:

```sh
npm run build:web
npm run typecheck:web
npm run test:foundation --workspace=@lume/web
npm run test:vehicles --workspace=@lume/web
npm run verify:vehicles --workspace=@lume/web
npm run verify:foundation --workspace=@lume/web
node apps/web/scripts/scan-output.mjs
# Start a separate read-only local server with the staging bindings and media/contact URLs:
npm run start --workspace=@lume/web
# Against it (or set WEB_VERIFY_BASE_URL to the immutable hosted Preview origin):
npm run verify:vehicle-browser --workspace=@lume/web
```

The browser verifier uses the monorepo's existing Playwright installation and a Chromium executable (`WEB_VERIFY_CHROMIUM`, default `/usr/bin/chromium`). On this cloud machine Chromium does not trust the injected HTTPS proxy CA by default. `WEB_VERIFY_PROXY_CA=/usr/local/share/ca-certificates/environment-proxy-ca.crt` pins that explicitly supplied certificate's SPKI **only in the test browser process**. Default runs use normal Chromium validation; app/runtime TLS settings and persistent trust stores are unchanged. Script failures caused by JavaScript being disabled are expected; media failures are not ignored. No certificate-verification bypass is added to product code.

## Remaining rollout gates and later phases

This is a reviewable vehicle slice, **not authorization for customer traffic**. Real concierge/visitor/consent integration remains Phase 4; configured vehicle models, decoder packaging, model CORS and full viewer compatibility remain Phase 5. Phase 3's published content/templates are not implemented. Production-shaped quotas/metering, origin policies, gallery privilege, both template/theme combinations, verified customer domains, sitemap/indexability, routing/cutover and rollback still need their assigned later gates. Native images prioritize only the first photo and lazy-load the remainder; this does not claim the Phase 6 mobile performance budget. The demonstrated PNG is about 1.87 MB; responsive image delivery needs measurement and optimization before rollout.

Do not merge to main or cut over traffic from this PR. Stop after Phase 2 review.
