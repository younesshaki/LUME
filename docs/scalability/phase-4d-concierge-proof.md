# Phase 4d — concierge consumers and end-to-end proof

This slice is based directly on staging `ee354b574b75c500408cd2cb04c2dd64b469ff46` after 4a–4c. Application commit `56c2c99cbdccd69c7bd968cbbc27ae82fa3bed80` is deployed only to the isolated, noindex [web Preview](https://lume-web-phase3-hakicsi89.vercel.app/vehicles?tenant=demo). Josh explicitly approved the push, draft PR and Preview deployment/upstream update. No merge, live traffic cutover or later phase is included.

**Funded answer: pending funding.** The real web proxy and mobile UI reach the staging admin and show the expected sanitized HTTP 502 provider error. DeepSeek's underlying balance status is hidden by admin; the unfunded reason is owner-confirmed. No hosted SSE frames were emitted, so successful streamed action dispatch remains unproven. Anonymous visitor rejection and session-cookie clearing are proven; authenticated visitor issuance/forwarding still requires an approved existing session.

The code changes are confined to `apps/web`, evidence/docs and a four-line opt-in shared transport guard. The only environment change was web's **Preview-only** `WEB_PREVIEW_UPSTREAM_ORIGIN`, pointing to the owner's already redeployed/allowlisted staging admin. Vite/admin code, production configuration, production Origin allowlists, database schema and demo/default configuration are untouched.

## Implementation

The history recorder now observes pathname **and search** transitions. Filtering inventory twice on `/vehicles` records both URLs; refreshing the second URL does not create a duplicate entry. Concierge back actions resolve from public same-origin history, scoped away from other tenant selectors, and rewind that stack before `router.replace`. They never call browser `history.back()`. Tenant selectors are carried into every action destination, including comparison and form targets. Stored history is revalidated against external, encoded-private and malformed paths. Unavailable tab storage falls back to a grounded filter/inventory destination.

Dialogs own an opaque preview palette instead of inheriting translucent template surfaces; browser checks record opacity 1 and a 16.12:1 dialog text/background contrast. The mobile inquiry layout is constrained and its successful receipt is captured.

The chat launcher is available on published content, inventory, comparison and vehicle detail, so a visitor can continue across zones using the same tenant-scoped chat session. Switching tenant remounts the dialog. Chat code remains an intent-loaded client island; metadata/content remain server-owned.

`compare_vehicles` navigates to `/vehicles/compare?ids=<uuid>,<uuid>&tenant=...`. The target renders a real side-by-side server table for two or three unique UUIDs. Every selection goes through the existing tenant/live visibility lookup before any detail is exposed. Foreign/unknown tenants, foreign vehicles and malformed selections return 404. Existing UUID vehicle detail routes are retained. Unknown price, missing imagery/mileage and sold flags use the existing presentation semantics.

`open-lead-form` navigates to contact and consumes bounded, allowlisted prefill once. Pending input is tab/tenant/path/handler scoped, expires after five minutes on access, and has an in-memory fallback when storage is blocked. No contact details enter URLs or localStorage. Visitor edits remain editable. Vehicle ID and trusted chat session/target/conversation attribution are retained in the existing lead body.

`capture_lead` submits through the same-origin existing lead contract, with credentialed requests and a visible success or validation error. It does not claim success before an actual accepted response. Existing duplicate-lead 200 and new-lead 201 semantics are preserved. Captcha/validation failures remain failures; no verification or Origin spoofing is introduced. Local browser submissions are intercepted fixtures; no real lead is created by this task.

`navigate-target` validates the trusted descriptor again, substitutes safe path parameters and navigates before activation. Built-in contact and vehicle inquiry surfaces receive typed prefill. Other registered safe IDs support native form focus or a native dialog; arbitrary selectors, scripts, external/private destinations and invented modal contents are not executed. The destination must actually provide the registered surface. The vehicle detail now has a real inquiry dialog using the existing shared form/verification leaves and lead transport.

Effects remain buffered until a turn finishes. Web opts into `requireCompletion`, a four-line shared transport addition that rejects EOF without `[DONE]`; other callers retain their previous default behavior. Failed, truncated, aborted and duplicate turns cannot execute buffered navigation/conversions. The signed visitor-cookie filter is retained. Hosted testing also exposed the ingress/Origin handling gaps described below; seven visitor checks now pass. Saved-vehicles UI is intentionally outside this slice's optional scope.

## Hosted integration fixes discovered by this proof

The merged 4a/4c handlers existed but ingress still recognized only the older vehicles/leads/consent APIs. Real chat POSTs returned `405 Read-only preview`; tenant headers on visitor reads returned 404 before their handler. Ingress now explicitly admits chat and the visitor API family, retaining host validation, duplicate-selector rejection, the internal-header ban and the narrower method policy on other paths. Visitor handlers still own their endpoint allowlist and tenant/origin checks. A pure policy regression suite is paired with **actual HTTP requests through a production Next build**, rather than claiming direct-handler checks prove framework ingress.

Chrome omits `Origin` on credentialed same-origin GET fetches. Visitor reads previously rejected those requests with 403. The bridge now derives its own Origin only for GET with `Sec-Fetch-Site: same-origin` and fetch mode `cors`/`same-origin`; tenant/host verification still precedes upstream access. Foreign origins, cross-site/same-site reads, metadata-free reads and Origin-less mutations remain rejected. POST and DELETE still require explicit same-origin Origin. The cookie filter continues to relay only `lume_visitor_session`.

## Local proof and clean gates

All alpha/beta/vehicle/target data in local evidence is **synthetic and loopback-only**. Browser SSE and lead receipts are explicitly intercepted fixtures, never represented as real provider responses or remote writes. Actual Next rendering, hydration, router/search transitions, native refresh and forms run normally.

| Gate               | Evidence                                                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multi-zone history | Same-path BMW→Audi changes recorded; refresh retains Audi/filter URL and SSR results; VDP→results, repeated previous and products→prior results preserve tenant/filter state |
| Comparison         | SSR side-by-side table, two scoped vehicle columns and one h1; foreign UUID/tenant, unknown tenant and malformed selection return 404                                        |
| Deferred consumers | One-shot cross-route prefill, edits and attribution; direct capture success/validation; registered form/dialog activation and real inquiry modal                             |
| Failure semantics  | Truncated/failed/aborted or duplicate turns do not execute buffered conversions/navigation                                                                                   |
| Browser            | **9 journeys /17 fixture SSE turns /zero page exceptions**, 390×844; opaque dialogs with 16.12:1 text/background contrast                                                    |
| Framework ingress  | Real POST chat/logout and Origin-less browser-style GET reach their handlers; deliberately empty upstream returns 503 without external calls                                 |
| Isolation          | Alternating alpha/beta HTML and React Flight, 20 concurrent requests, 12 forged/unknown host/selector negatives                                                              |

- [Browser request/action/receipt report](evidence/phase-4d/local-browser-report.json), [filtered-refresh HTML](evidence/phase-4d/local-filtered-refresh.html), [comparison HTML](evidence/phase-4d/local-comparison.html)
- [Comparison screenshot](evidence/phase-4d/local-comparison-mobile.jpg), [inquiry screenshot](evidence/phase-4d/local-vehicle-inquiry-mobile.jpg)
- [Actual foundation/ingress output](evidence/phase-4d/local-foundation-ingress.txt), [verification record](evidence/phase-4d/verification.txt)

A real `npm install --legacy-peer-deps` was used in the dedicated worktree; no node_modules directory symlink. Web `.next`, `next-env.d.ts` and incremental state were deleted **before** bare typecheck. package-lock matches staging.

| Local command                                                                    | Result                                                                                                             |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `npm run typecheck:all`                                                          | PASS before generated Next declarations                                                                            |
| `npm run build --workspace=@lume/web`                                            | PASS including import boundaries                                                                                   |
| `npm run typecheck --workspace=@lume/blocks`                                     | PASS                                                                                                               |
| `node --import tsx --conditions=react-server --test apps/web/checks/*.check.mjs` | **55/55**: foundation 7, vehicles 8, content 8, concierge 12, visitor 7, navigation 6, hosted-outcome 4, ingress 3 |
| `npm run verify:foundation --workspace=@lume/web`                                | PASS actual ingress, HTML/Flight/concurrency and host/selector checks                                              |
| `npm run verify:concierge --workspace=@lume/web`                                 | PASS 9 browser journeys /17 fixture turns                                                                          |
| `git diff --check`                                                               | PASS                                                                                                               |
| Compiled credential scan                                                         | PASS 130 server/client outputs, zero inherited configured credential matches                                       |

[Clean GitHub Actions on application commit 56c2c99](https://github.com/younesshaki/LUME/actions/runs/40886946493) is **SUCCESS**: migration sequence, all-workspace typecheck, root tests, live Vite build and admin build all pass. Those root tests/builds were run by CI; they are not claimed rerun locally. No SFTP test changes or timeout masking. Final PR-head CI is reported in the PR body after the evidence commit.

## Actual hosted evidence

Preview deployment **`dpl_GJWVvp1cVAFWxCU59VeGdx6eFFfv`**, source **`56c2c99`**, is READY with Vercel target `staging` (Preview), never production. The existing stable alias is retained; the newer unassigned hostname is not used. Its upstream is the owner's existing staging admin `https://lume-admin-f2zgcm9is-hakicsi89-5044s-projects.vercel.app`.

| Probe                                    | Captured result                                                                                                                                    | Limit                                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Web inventory                            | HTTP 200, noindex                                                                                                                                  | Real demo data only                                                                               |
| Web navigation and creative-answer POSTs | Both HTTP 502, raw `{"error":"AI provider request failed"}`                                                                                        | Expected owner-confirmed unfunded state; exact DeepSeek status sanitized                          |
| Real mobile chat                         | Visible provider error, no false success or navigation, zero page exceptions                                                                       | No action frames arrived                                                                          |
| Browser visitor GET                      | Origin naturally absent, Fetch Metadata same-origin/cors, tenant header demo; HTTP 401                                                             | Anonymous rejection, not login proof                                                              |
| Cookie-less visitor logout               | HTTP 204; only `lume_visitor_session` clearing cookie                                                                                              | No visitor/session created or revoked                                                             |
| Filter form and browser refresh          | Selected real make retained in URL/form and recorded history                                                                                       | Does not pretend an unfunded bot dispatched an action                                             |
| Comparison                               | Two real UUIDs, SSR specs/prices, correct title/description/canonical, exactly one h1 and noindex; mobile screenshot                               | Existing staging values are displayed without editing inventory                                   |
| Rejection                                | Unknown tenant, mismatched selector, internal header and duplicate selector: 404; foreign Origin, metadata-free read and Origin-less mutation: 403 | Staging has only one real tenant; multi-tenant contamination proof is local deterministic testing |

- [Current deployment/binding/production audit](evidence/phase-4d/hosted-phase4d-deployment.json)
- [HTTP report](evidence/phase-4d/hosted-web-unfunded-report.json), [navigation raw body](evidence/phase-4d/hosted-web-navigation-error.txt), [answer raw body](evidence/phase-4d/hosted-web-provider-error.txt)
- [Real browser report, no interception](evidence/phase-4d/hosted-browser-report.json), [mobile error screenshot](evidence/phase-4d/hosted-unfunded-chat-mobile.jpg)
- [Read-only SSR and rejection output](evidence/phase-4d/hosted-read-only-report.json), [raw server HTML](evidence/phase-4d/hosted-comparison.html), [mobile comparison](evidence/phase-4d/hosted-comparison-mobile.jpg)
- [Actual deployment function output](evidence/phase-4d/hosted-phase4d-functions.json): **6 entries /5 distinct function IDs; conservatively 6/12 used and 6 headroom**

The Preview binds only `WEB_PREVIEW_*` application variables, staging project ref **`hapyyupeugxccofpibor`** and tenant demo. Its publishable credential is opaque; no JWT project ref is claimed decoded. Successful staging reads and the explicit staging origin establish the endpoint used. No web service-role/provider/signing/generic production key or Vercel test mode is configured. Ten downloaded inventory client scripts contain no configured credential values or admin module-path matches; the import boundary guard also audits lazy/shared source graphs. These scans are bounded evidence, not a claim to prove arbitrary binaries safe.

The audit compares Vite/admin production deployments, aliases, root/build/install settings and production Origin digests with the pre-update snapshot: **unchanged**. Vite remains `dpl_2ZqooHgcvQEX6iox7UbFjW8b2XHo`; admin production remains `dpl_7nWpz7u7FpWnZbWD1SNQMC6EvyPa`. The stable web alias serves only the isolated Preview.

Historical pre-update files (`hosted-environment-audit.json`, `hosted-web-route-audit.json`, and direct-admin reports) are retained as history. Their Phase 3/stale-route statements describe the earlier deployment, not the current Preview. Immediately after alias reassignment a reused diagnostic URL also returned an old ingress response; the runner now uses a unique evidence query. Fresh HTTP probes and the browser's unmodified real chat request both reach the new handler.

Chat probes can create normal staging conversation/usage accounting. No lead, save, account, session token, tenant configuration, database schema, admin setting or production Origin was fabricated/changed. Logout had no cookie. No proxy-origin spoof or substituted local response is counted as hosted proof.

## Reproduce and remaining owner gate

The deployment/upstream step is complete under Josh's explicit approval; do not request or infer another production deployment. Current web Preview bindings are staging `WEB_PREVIEW_SUPABASE_URL`, `WEB_PREVIEW_PROJECT_REF`, `WEB_PREVIEW_SUPABASE_ANON_KEY`, `WEB_PREVIEW_DEFAULT_TENANT`, `WEB_PREVIEW_HOSTS`, `WEB_PREVIEW_UPSTREAM_ORIGIN`, public R2 base and contact URL. Never put a provider or signing secret in web, VITE or NEXT_PUBLIC bindings.

To complete a funded provider-answer and streamed browser-action run, **Josh must fund the existing staging-admin server-only `DEEPSEEK_API_KEY`** (or replace that binding with a funded staging key and redeploy admin). Its `DEEPSEEK_API_URL` is `https://api.deepseek.com/v1/chat/completions`. The exact stable web origin must remain in staging Preview `ALLOWED_CHAT_ORIGINS`; it is already present. If admin is redeployed, web's Preview-only `WEB_PREVIEW_UPSTREAM_ORIGIN` must reference that new staging deployment. No production allowlist change. An approved existing staging visitor session is needed separately for authenticated cookie issuance/forwarding proof; do not seed or forge one. Existing tenant chat/action entitlement must be usable; do not edit demo/default to manufacture success.

The approved unfunded HTTP diagnostic can be reproduced without secrets in the command:

```sh
WEB_PREVIEW_HOSTED_SMOKE_APPROVED=1 \
WEB_PREVIEW_SMOKE_EXPECT_UNFUNDED=1 \
WEB_PREVIEW_SMOKE_ORIGIN=https://lume-web-phase3-hakicsi89.vercel.app \
WEB_PREVIEW_DEFAULT_TENANT=demo \
CONCIERGE_EVIDENCE_DIR=/path/outside-repository \
node apps/web/scripts/verify-concierge-hosted.mjs
```

The runner records raw response bodies or SSE wire order. Missing routes, Origin/configuration/network/quota failures are not relabelled as balance. Its four classifier regressions distinguish these failures. A deterministic SSE response can prove its frames but cannot pass the funded-answer check; funded mode additionally requires model/tool timing evidence. The HTTP runner does not itself prove browser action dispatch or authenticated sessions.

**Exit-gate disposition:** local history, comparison and deferred consumers are proven; real staging SSR, rejection, anonymous visitor bridge, cookie clearing and expected unfunded error handling are proven. Real `meta → delta → action → [DONE]`, successful hosted action dispatch and authenticated visitor memory are still **not proven**. The real funded answer is **pending funding**. Keep the PR draft and stop for review; no later phase or live cutover.
