# Phase 4d — concierge consumers and end-to-end proof

This slice starts directly from staging `ee354b574b75c500408cd2cb04c2dd64b469ff46` after 4a–4c. The implementation is local commit `6a402d9`. It changes the isolated Next preview only, plus an opt-in completion guard in the shared chat transport. Vite, admin, API ownership, origin settings, database schema and tenant data are unchanged. No traffic cutover or later phase is started.

**Hosted exit gate: BLOCKED, not proven.** Josh must provision/confirm funded staging and its origin allowlist before a hosted request. The local evidence below is deliberately not a real-provider claim. Push and a draft PR also require Josh's explicit approval; none has been inferred from elapsed time or earlier phases.

## Implementation

The history recorder now observes pathname **and search** transitions. Filtering inventory twice on `/vehicles` records both URLs; refreshing the second URL does not create a duplicate entry. Concierge back actions resolve from public same-origin history, scoped away from other tenant selectors, and rewind that stack before `router.replace`. They never call browser `history.back()`. Tenant selectors are carried into every action destination, including comparison and form targets. Stored history is revalidated against external, encoded-private and malformed paths. Unavailable tab storage falls back to a grounded filter/inventory destination.

The chat launcher is available on published content, inventory, comparison and vehicle detail, so a visitor can continue across zones using the same tenant-scoped chat session. Switching tenant remounts the dialog. Chat code remains an intent-loaded client island; metadata/content remain server-owned.

`compare_vehicles` navigates to `/vehicles/compare?ids=<uuid>,<uuid>&tenant=...`. The target renders a real side-by-side server table for two or three unique UUIDs. Every selection goes through the existing tenant/live visibility lookup before any detail is exposed. Foreign/unknown tenants, foreign vehicles and malformed selections return 404. Existing UUID vehicle detail routes are retained. Unknown price, missing imagery/mileage and sold flags use the existing presentation semantics.

`open-lead-form` navigates to contact and consumes bounded, allowlisted prefill once. Pending input is tab/tenant/path/handler scoped, expires after five minutes on access, and has an in-memory fallback when storage is blocked. No contact details enter URLs or localStorage. Visitor edits remain editable. Vehicle ID and trusted chat session/target/conversation attribution are retained in the existing lead body.

`capture_lead` submits through the same-origin existing lead contract, with credentialed requests and a visible success or validation error. It does not claim success before an actual accepted response. Existing duplicate-lead 200 and new-lead 201 semantics are preserved. Captcha/validation failures remain failures; no verification or Origin spoofing is introduced. Local browser submissions are intercepted fixtures; no real lead is created by this task.

`navigate-target` validates the trusted descriptor again, substitutes safe path parameters and navigates before activation. Built-in contact and vehicle inquiry surfaces receive typed prefill. Other registered safe IDs support native form focus or a native dialog; arbitrary selectors, scripts, external/private destinations and invented modal contents are not executed. The destination must actually provide the registered surface. The vehicle detail now has a real inquiry dialog using the existing shared form/verification leaves and lead transport.

Effects remain buffered until a turn finishes. Web opts into `requireCompletion`, a four-line shared transport addition that rejects EOF without `[DONE]`; other callers retain their previous default behavior. Failed, truncated, aborted and duplicate turns cannot execute buffered navigation/conversions. The existing signed visitor cookie bridge is unchanged; its five checks still pass. Saved-vehicles UI is intentionally outside this slice's optional scope.

## Captured local evidence

All data here is **synthetic, loopback-only alpha/beta fixtures**, never fabricated remote tenants or edits to staging demo/default. Browser SSE and lead responses are explicitly intercepted fixtures. Actual Next production rendering, client hydration, router/query changes, native refresh, dialogs and form bodies run normally.

| Gate                        | Captured result                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Query/history across zones  | BMW → Audi on the same pathname records both filter URLs; refresh retains Audi/price and SSR results; VDP → results, repeated previous, and products → prior results preserve tenant/filter state |
| Comparison                  | Raw server HTML has two scoped vehicle columns/specs and exactly one h1; foreign UUID/tenant, unknown tenant and malformed selection return HTTP 404                                              |
| Lead consumers              | Cross-route open/prefill, visitor edits, attributed form submission, direct capture success, same-route form target and cross-route inquiry modal all execute against the labelled local contract |
| Registered custom targets   | Local native form/dialog fixtures activate by a safe registered ID                                                                                                                                |
| Failure semantics           | Lead validation is visible; interrupted/truncated SSE cannot navigate or submit; duplicate SSE cannot submit another lead                                                                         |
| Browser result              | **9 journeys, 17 local SSE turns, zero browser exceptions** at 390×844                                                                                                                            |
| Existing transport/firewall | All web suites pass; import boundary guard and configured credential scan pass                                                                                                                    |
| Real provider/hosted SSE    | **NOT RUN — owner provisioning gate below**                                                                                                                                                       |

- [Local browser request/action/receipt report](evidence/phase-4d/local-browser-report.json)
- [Raw filtered refresh HTML](evidence/phase-4d/local-filtered-refresh.html)
- [Raw comparison HTML](evidence/phase-4d/local-comparison.html)
- [Mobile comparison](evidence/phase-4d/local-comparison-mobile.jpg) and [vehicle inquiry](evidence/phase-4d/local-vehicle-inquiry-mobile.jpg)
- [Local gate results](evidence/phase-4d/verification.txt)

Reproduce from a dedicated worktree with a real `npm install --legacy-peer-deps`; do not symlink node_modules. Delete untracked `apps/web/next-env.d.ts`, `apps/web/.next` and incremental build information before standalone typechecking. The committed local harness uses only loopback fixtures and never needs provider keys:

```sh
npm run typecheck:all
npm run build --workspace=@lume/web
npm run typecheck --workspace=@lume/blocks
node --import tsx --conditions=react-server --test apps/web/checks/*.check.mjs
npm run verify:concierge --workspace=@lume/web
git diff --check
```

Current local results: all commands pass; suites are foundation 7, vehicles 8, content 8, concierge 12, visitor 5 and navigation 6 (**46 total**). The scan covers 139 compiled server/client outputs with zero inherited credential value matches. package-lock is restored to staging; no dependency or runtime package allowance changed. The full repository Vitest suite is not claimed rerun by this slice; historical SFTP timeouts are untouched. GitHub CI must be observed after approved push/PR creation.

## Josh's provisioning gate — before any hosted run

No hosted request has been attempted. Supply secrets through project environment settings, never chat, git, VITE or public browser bindings. Confirm the stable web Preview URL and the staging admin Preview URL after setting the following.

### Web Preview project, Preview target only

| Variable                         | Required setting                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| `WEB_PREVIEW_SUPABASE_URL`       | The existing staging Supabase origin, never production                                     |
| `WEB_PREVIEW_PROJECT_REF`        | The matching staging ref (`hapyyupeugxccofpibor` for the existing staging project)         |
| `WEB_PREVIEW_SUPABASE_ANON_KEY`  | Matching staging anon/publishable binding                                                  |
| `WEB_PREVIEW_DEFAULT_TENANT`     | Existing staging tenant slug to test, such as demo; no seeding or edits                    |
| `WEB_PREVIEW_HOSTS`              | Exact stable web preview hostname; immutable Vercel Preview host is accepted automatically |
| `WEB_PREVIEW_UPSTREAM_ORIGIN`    | Current staging admin `https://<deployment>.vercel.app` origin, no path/query/credentials  |
| `WEB_PREVIEW_R2_PUBLIC_BASE_URL` | Existing public staging media origin when exercising images                                |

A web service-role key is **not required** for this smoke. Model keys, `VISITOR_SESSION_SECRET`, generic Supabase/R2 credentials, PostHog and `NEXT_PUBLIC_*` are never placed in the web project. `WEB_PREVIEW_TEST_MODE` must be absent on Vercel.

### Staging admin project, staging branch / Preview target only

| Variable                                                         | Required setting                                                                                    |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Existing matching **staging** project bindings; no production values                                |
| `DEEPSEEK_API_KEY`                                               | Valid **funded** server-only staging key                                                            |
| `DEEPSEEK_API_URL`                                               | `https://api.deepseek.com/v1/chat/completions` (the default if unset)                               |
| `ALLOWED_CHAT_ORIGINS`                                           | Append the exact stable web Preview origin, preserving existing entries; never add it to production |
| `VISITOR_SESSION_SECRET`                                         | Existing staging-only signing secret for a returning-visitor session check; never copy it to web    |

Confirm the existing staging bot/plan has usable chat/action entitlement and a funded DeepSeek route. Do not fabricate tenant data, seed a second tenant or edit demo/default settings to manufacture success. Redeploy staging admin after an approved env/allowlist change, then set web's upstream to that deployment and deploy web as **Preview**, never production. No origin update or deploy is authorized merely by this document.

Once Josh explicitly confirms provisioning and authorizes the hosted run, the prepared runner sends one chat-only inventory prompt through web → staging admin → provider. It does not submit a lead, save a vehicle or create a visitor; normal staging conversation/usage accounting may occur. The operator flags below belong only to the verification process, not the web application's runtime bindings:

```sh
WEB_PREVIEW_HOSTED_SMOKE_APPROVED=1 \
WEB_PREVIEW_SMOKE_ORIGIN=https://<stable-web-preview>.vercel.app \
WEB_PREVIEW_DEFAULT_TENANT=demo \
CONCIERGE_EVIDENCE_DIR=/path/outside-repository \
node apps/web/scripts/verify-concierge-hosted.mjs
```

The runner refuses to make its first network request without that explicit flag. Capture raw SSE and safe response headers; require actual metadata, provider prose delta, structured action and `[DONE]`, no SSE error. Keep the **actual wire order**: the current contract may emit an action before prose; do not reorder evidence to imitate `meta → delta → action → [DONE]`. Web defers the effect until completion in either order. Record the stable/immutable deployment IDs, actual environment target/ref audit, function manifest/headroom, browser navigation outcome and any provider/quota/origin failure. A 403, 402, missing action, missing terminator or error leaves this gate open. Local fixtures are never substituted.

The full Phase 4 exit gate remains open until this funded provider/hosted evidence and any required returning-visitor check are reviewed. Stop after this slice for review; no Phase 5/cutover work is included.
