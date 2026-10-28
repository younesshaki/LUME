# Phase 4d — concierge consumers and end-to-end proof

This slice starts directly from staging `ee354b574b75c500408cd2cb04c2dd64b469ff46` after 4a–4c. The implementation including the mobile readability fix is local commit `5f3d237`. It changes the isolated Next preview only, plus an opt-in completion guard in the shared chat transport. This branch does not change Vite, admin, API ownership, origin settings, database schema or tenant configuration. The owner separately redeployed staging admin with its Preview allowlist updated, as recorded below. No traffic cutover or later phase is started.

**Funded answer: pending funding.** The owner confirmed that staging admin was redeployed/allowlisted, but DeepSeek has no balance. Expected unfunded provider failure is a diagnostic outcome, not a product bug or a completed-answer claim. Actual read-only web checks and two direct staging-admin chat probes are captured below. The web Preview is still on Phase 3 and requires a separate deployment/upstream update before its full chain can be tested. Push, draft PR creation and a new isolated web deployment await explicit owner approval.

## Implementation

The history recorder now observes pathname **and search** transitions. Filtering inventory twice on `/vehicles` records both URLs; refreshing the second URL does not create a duplicate entry. Concierge back actions resolve from public same-origin history, scoped away from other tenant selectors, and rewind that stack before `router.replace`. They never call browser `history.back()`. Tenant selectors are carried into every action destination, including comparison and form targets. Stored history is revalidated against external, encoded-private and malformed paths. Unavailable tab storage falls back to a grounded filter/inventory destination.

Dialogs own an opaque preview palette instead of inheriting translucent template surfaces; browser checks record opacity 1 and a 16.12:1 dialog text/background contrast. The mobile inquiry layout is constrained and its successful receipt is captured.

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
| Real provider/hosted SSE    | **Admin error path observed; funded answer pending funding; web Preview still stale**                                                                                                             |

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

Current local results: all commands pass; suites are foundation 7, vehicles 8, content 8, concierge 12, visitor 5, navigation 6 and hosted-outcome classification 4 (**50 total**). The scan covers 139 compiled server/client outputs with zero inherited credential value matches. package-lock is restored to staging; no dependency or runtime package allowance changed. The full repository Vitest suite is not claimed rerun by this slice; historical SFTP timeouts are untouched. GitHub CI must be observed after approved push/PR creation.

## Observed hosted state — unfunded mode

The owner authorized diagnostics with no DeepSeek balance. These are actual responses, never fixtures:

| Probe                                        | Observed result                                       | Honest implication                                                             |
| -------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| Stable web `/vehicles?tenant=demo`           | HTTP 200, noindex                                     | Existing Phase 3 Preview is reachable                                          |
| Stable web `/api/chat` and `/api/visitor/me` | HTTP 404                                              | Phase 4 chat/visitor routes are not deployed; this is not a balance response   |
| New `lume-web-preview.vercel.app` alias      | Vercel alias lookup 404                               | That newer hostname is not assigned                                            |
| Current staging admin navigation prompt      | HTTP 502, `AI provider request failed`                | Expected owner-confirmed unfunded provider outcome; no SSE frames emitted      |
| Current staging admin provider-answer prompt | Same HTTP 502 contract                                | Funded answer remains **pending funding**                                      |
| Direct admin anonymous visitor `/me`         | HTTP 401                                              | Correct anonymous rejection, not authentication proof                          |
| Direct admin logout with no session cookie   | HTTP 204, only `lume_visitor_session` clearing cookie | Admin cookie-clearing contract observed, no visitor/session created or revoked |

The current web alias points to deployment `dpl_2WRiWovc3UJk4Bm5wxLLHKzvnRKx`, source `458996a` (Phase 3), and `WEB_PREVIEW_UPSTREAM_ORIGIN` still points to the old admin `lume-admin-jzts0chbg-…` deployment. The owner's new admin is `dpl_7ksDyUt9318raGeM2w1ZcETr7FuZ`, source `ee354b574`, at `https://lume-admin-f2zgcm9is-hakicsi89-5044s-projects.vercel.app`.

The admin maps failed provider HTTP statuses, including DeepSeek 402, to sanitized **502 JSON** before SSE is created. The response does not reveal the original provider status, so an exact balance error is not independently proven from the wire; the unfunded reason is owner-confirmed. Neither probe produced metadata/delta/action/[DONE]. Do not claim streamed action dispatch or a funded answer from those errors. Deterministic server replies can sometimes bypass the provider, but that did not happen for these observed requests.

- [Deployment/binding audit](evidence/phase-4d/hosted-environment-audit.json)
- [Actual web route checks](evidence/phase-4d/hosted-web-route-audit.json)
- [Direct-admin results and visitor-cookie limits](evidence/phase-4d/hosted-admin-unfunded-report.json)
- [Navigation error body](evidence/phase-4d/hosted-admin-navigation-error.json) and [provider error body](evidence/phase-4d/hosted-admin-provider-error.json)

No origin setting, deployment, account, lead, saved vehicle or tenant configuration was changed by these probes. The two chat requests can create normal staging conversation/usage accounting. The visitor logout had no token, so it did not delete a session. Authenticated visitor issuance/forwarding still needs an approved existing session; none was forged or seeded.

## Remaining Preview deployment gate

Unfunded diagnostics have been authorized and performed as described above. Supply secrets through project environment settings, never chat, git, VITE or public browser bindings. Confirm the stable web Preview URL and the staging admin Preview URL after setting the following.

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

| Variable                                                         | Required setting                                                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Existing matching **staging** project bindings; no production values                                    |
| `DEEPSEEK_API_KEY`                                               | Existing server-only staging key; currently **unfunded**. Funding is needed only for a real paid answer |
| `DEEPSEEK_API_URL`                                               | `https://api.deepseek.com/v1/chat/completions` (the default if unset)                                   |
| `ALLOWED_CHAT_ORIGINS`                                           | Append the exact stable web Preview origin, preserving existing entries; never add it to production     |
| `VISITOR_SESSION_SECRET`                                         | Existing staging-only signing secret for a returning-visitor session check; never copy it to web        |

Confirm the existing staging bot/plan has usable chat/action entitlement. A paid DeepSeek route remains pending funding; do not change tenant settings to force a free deterministic answer. Do not fabricate tenant data, seed a second tenant or edit demo/default settings to manufacture success. Redeploy staging admin after an approved env/allowlist change, then set web's upstream to that deployment and deploy web as **Preview**, never production. No origin update or deploy is authorized merely by this document.

The tested Phase 4d code must be deployed as an isolated **Preview**, and its `WEB_PREVIEW_UPSTREAM_ORIGIN` updated to the new staging admin. Reuse the existing stable allowlisted alias unless the owner explicitly chooses another. This is separate from production and does not authorize a repository push or deployment by inference.

After that deployment is explicitly approved, the runner supports the owner-confirmed unfunded case. Its flags belong only to this operator process, never the web runtime:

```sh
WEB_PREVIEW_HOSTED_SMOKE_APPROVED=1 \
WEB_PREVIEW_SMOKE_EXPECT_UNFUNDED=1 \
WEB_PREVIEW_SMOKE_ORIGIN="https://<stable-web-preview>.vercel.app" \
WEB_PREVIEW_DEFAULT_TENANT=demo \
CONCIERGE_EVIDENCE_DIR=/path/outside-repository \
node apps/web/scripts/verify-concierge-hosted.mjs
```

It first checks the chat route exists, then records separate navigation and provider-answer probes plus anonymous visitor/cookie-clear checks. Explicit balance failures and the exact sanitized provider-failure contract are accepted only in unfunded mode. A stale route, Origin 403, missing provider configuration, transport failure or quota response is **not** relabelled as balance. Four regression checks cover that distinction.

All actual raw response bodies and SSE wire order are retained. A deterministic meta/action/delta/[DONE] proves those frames, not a funded model answer. The funded mode additionally requires server timing to identify a real model/tool route; deterministic-only SSE cannot pass it. The HTTP runner does not itself prove browser action dispatch or authenticated visitor sessions; those require the deployed browser journey and an approved session.

A provider error occurring before SSE cannot prove metadata, deltas, action dispatch or [DONE]. Local fixtures are never substituted. The full Phase 4 exit gate remains open; the real funded-answer check is **pending funding**. Stop after this slice for review; no Phase 5/cutover work is included.
