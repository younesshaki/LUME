## SCRUM-102 Billing schema migration (plans, subscriptions, invoices)
- Status: done
- Files: supabase/migrations/030_billing_schema.sql, packages/db/src/schema.ts
- Migration: 030_billing_schema.sql (NOT applied)
- Env added: none
- Review notes / open questions: Jira requested seeding Free, Starter, and Pro inside the migration, but the sweep guardrail forbids migration data mutation. Claude should decide whether plan bootstrap belongs in a separate reviewed seed script or provider-sync job.

## SCRUM-156 I-13: tenant_bot_config table — persona, tools whitelist, model selection
- Status: done
- Files: supabase/migrations/031_tenant_bot_config.sql, packages/db/src/schema.ts
- Migration: 031_tenant_bot_config.sql (NOT applied)
- Env added: none
- Review notes / open questions: `allowed_tools` intentionally defaults to deny-all. Onboarding must create the tenant row explicitly after Claude applies the migration; no migration seed/backfill was added because data mutation is forbidden in this sweep.

## SCRUM-133 Loyalty points schema and accrual engine
- Status: done
- Files: supabase/migrations/032_loyalty_accrual.sql, packages/types/src/loyalty.ts, packages/db/src/{schema,loyalty,index}.ts, apps/admin/app/api/{leads,visitor/chat-history}/route.ts
- Migration: 032_loyalty_accrual.sql, 033_loyalty_account_linking.sql (NOT applied)
- Env added: none
- Review notes / open questions: Existing producers now award first persisted chat session (+5) and authenticated lead submission (+50), idempotently; existing email-linked accounts are reused. Saved-vehicle (+10) and referral (+100) need future producer routes. The current public chat UI does not yet post to `/api/visitor/chat-history`, so Claude should verify that integration before expecting chat-session awards in production.

## SCRUM-201 Tenant webhooks table and delivery worker interface
- Status: done
- Files: supabase/migrations/034_tenant_webhooks.sql, packages/db/src/{schema,webhooks,index}.ts
- Migration: 034_tenant_webhooks.sql (NOT applied)
- Env added: none
- Review notes / open questions: Network I/O is impossible unless trusted server code injects both a decrypted signing secret and transport. Credential rows are RLS deny-all. Retry semantics use five delayed retries (1m, 5m, 30m, 1h, 6h), then dead-letter on the next failure; Claude should confirm this interpretation of Jira's ambiguous “five failures” wording and choose an encryption/KMS mechanism before storing credentials.

## SCRUM-162 CSV import lifecycle and status tracking
- Status: done
- Files: supabase/migrations/035_csv_imports.sql, packages/db/src/{schema,csvImports,index}.ts, apps/admin/app/admin/[tenant]/vehicles/import/{page,ImportClient}.tsx
- Migration: 035_csv_imports.sql (NOT applied)
- Env added: none
- Review notes / open questions: The existing browser-side importer now records durable counters, bounded diagnostics, and recent status, while continuing safely if tracking is unavailable during a staggered rollout. `source_object_path` is reserved for a future private-file/background worker; this ticket does not claim crash-resumable processing, and the existing destructive replace mode remains a review risk because it is not transactional.

## SCRUM-177 Tenant-editable lost-reason taxonomy and reporting
- Status: done
- Files: supabase/migrations/036_lead_lost_reason_options.sql, packages/db/src/schema.ts, apps/admin/lib/leadLostReasons.ts, apps/admin/app/admin/[tenant]/{leads,analytics}/**
- Migration: 036_lead_lost_reason_options.sql (NOT applied)
- Env added: none
- Review notes / open questions: The six defaults remain code-owned to respect the no-data-mutation rule; tenant rows are overrides/custom options and deactivation is soft so history still reports. The trigger enforces active reasons on new lost transitions/reason changes while deliberately allowing unrelated edits to legacy lost rows with no reason. Claude should review that compatibility tradeoff before applying the migration.

## SCRUM-174 First-touch lead source attribution
- Status: done
- Files: supabase/migrations/037_lead_source_attribution.sql, packages/{types,db}/src/**, src/lib/{leadAttribution,leads,botActionConsumers}.ts, src/experience/ui/ContactPage/ContactPage.tsx, apps/admin/{lib,app}/**
- Migration: 037_lead_source_attribution.sql (NOT applied)
- Env added: none
- Review notes / open questions: Public boot now captures first-touch UTM source/medium/campaign/content plus document referrer in bounded session storage; explicit submission values win. Lead calls use credentialed CORS so visitor association can work, and only sanitized bot trigger/action/vehicle context is stored. Claude should verify visitor cookie SameSite/domain settings for the final public/admin deployment topology; `credentials: include` cannot override a cross-site cookie policy.

## SCRUM-110 Billing and plan administration UI
- Status: done
- Files: apps/admin/app/admin/[tenant]/settings/billing/**, apps/admin/lib/billing.ts, apps/admin/components/admin-shell.tsx
- Migration: none (depends on unapplied 030_billing_schema.sql)
- Env added: none
- Review notes / open questions: Owner/admin-authorized manual plan changes use a single service-role mutation and refuse provider-managed subscriptions; no Stripe call is made. Lead usage is counted for the current period, while chat/storage meters explicitly remain unavailable until SCRUM-103 supplies counters. Invoice PDF controls are intentionally disabled because the schema has no provider PDF URL. The plan catalog remains empty until Claude provisions reviewed plan rows outside migrations.

## SCRUM-154 Tenant bot tool whitelist
- Status: done
- Files: packages/bot/src/{registry,runner,types,index}.ts, apps/admin/lib/{chatTools,chatPersona}.ts, apps/admin/app/{api/chat,admin/[tenant]/persona}/**
- Migration: none (depends on unapplied 031_tenant_bot_config.sql)
- Env added: none
- Review notes / open questions: Missing config preserves legacy access to all registered tools; explicit `[]` disables all; config read errors fail closed. The same filtered list controls DeepSeek advertisement, system-prompt disclosure, and runner execution. Jira mentions `schedule_test_drive`, but no such callable tool is registered, so the UI truthfully lists only the seven real inventory tools; Claude should add it only with a real implementation.

## SCRUM-173 Manual and round-robin lead assignment
- Status: done
- Files: supabase/migrations/038_lead_assignment.sql, packages/db/src/schema.ts, apps/admin/lib/{leadAssignment,team}.ts, apps/admin/app/admin/[tenant]/{team,leads/[leadId]}/**
- Migration: 038_lead_assignment.sql (NOT applied)
- Env added: none
- Review notes / open questions: Existing RBAC roles remain unchanged; `sales_enabled` and `out_of_office` are additive tenant-member flags. The database trigger locks `tenant_settings`, advances a persistent cursor, and leaves leads unassigned when every sales member is away. Manual assignment is tenant-membership constrained. Claude should confirm that orthogonal sales participation is preferable to replacing the existing role check with a new `sales` RBAC role.

## SCRUM-204 Admin notification center
- Status: done
- Files: supabase/migrations/039_admin_notifications.sql, packages/db/src/{schema,notifications,index}.ts, apps/admin/app/admin/layout.tsx, apps/admin/app/admin/notification-actions.ts, apps/admin/components/admin-shell.tsx
- Migration: 039_admin_notifications.sql (NOT applied)
- Env added: none
- Review notes / open questions: New-lead and terminal CSV-import notifications are database-triggered and deliberately best-effort so they cannot break producer writes. Domain verification and storage quota work can call the exported best-effort helper when those later tickets land. The dropdown refreshes after mutations/navigation; Supabase Realtime publication is intentionally not required, so Claude can opt in during provisioning without making current behavior depend on it.

## SCRUM-205 Tenant onboarding checklist
- Status: done
- Files: apps/admin/app/admin/[tenant]/{page,OnboardingChecklist}.tsx, apps/admin/lib/onboardingChecklist.ts
- Migration: none
- Env added: none
- Review notes / open questions: The five steps derive from tenant theme/logo storage, inventory, non-default persona state, members/invites, and a verified domain or active published page. Dismissal is tenant-keyed browser-local storage and is honored only while every step remains complete; Claude should decide whether cross-device, per-user dismissal is worth a future persisted preference. Logo detection already recognizes likely theme keys so SCRUM-166 can wire its eventual URL without changing this widget.

## SCRUM-211 Vehicle status workflow
- Status: needs-provisioning(VERCEL_CRON)
- Files: supabase/migrations/040_vehicle_status_workflow.sql, packages/{types,db}/src/**, apps/admin/app/{api,admin}/**, apps/admin/lib/vehicleStatus.ts, apps/admin/components/status-badge.tsx
- Migration: 040_vehicle_status_workflow.sql (NOT applied)
- Env added: CRON_SECRET=...
- Review notes / open questions: Public API, bot queries, and a restrictive anon RLS policy expose only live vehicles; tenant members retain all-status visibility. Database triggers own immutable sold_at/sold_price facts, freeze price permanently after sale, permit sold→archived only, and prevent reopening archived sold rows. CSV replace now preserves sold/archived history. The protected bounded archival endpoint is implemented, but Claude must provision `CRON_SECRET` and schedule `/api/cron/archive-sold-vehicles` at least daily for the 90-day transition to run automatically.

## SCRUM-209 Bulk vehicle operations
- Status: done
- Files: supabase/migrations/041_bulk_vehicle_price_update.sql, packages/db/src/schema.ts, apps/admin/lib/bulkVehicles.ts, apps/admin/app/admin/[tenant]/vehicles/page.tsx, apps/admin/app/admin/[tenant]/vehicles/{VehiclesTableClient,VehicleBulkToolbar}.tsx, apps/admin/app/admin/[tenant]/vehicles/bulk-actions.ts
- Migration: 041_bulk_vehicle_price_update.sql (NOT applied)
- Env added: none
- Review notes / open questions: Selection is intentionally current-page scoped (25 rows) while server actions accept at most 200 unique UUIDs. Editor+ authorization and tenant ownership are rechecked inside every action. Mark-inactive maps to `archived`; generic status updates honor terminal sale rules; sold rows cannot be repriced or deleted. Price rules run atomically in a service-only RPC so existing price-history triggers capture every row, and every successful bulk commit attempts one audit-log entry.

## SCRUM-212 Vehicle price history and public trust signal
- Status: done
- Files: supabase/migrations/042_public_vehicle_price_signal.sql, packages/{types,db}/src/**, apps/admin/lib/priceHistory.ts, apps/admin/app/admin/[tenant]/vehicles/**, apps/admin/app/api/vehicles/[id]/price-signal/route.ts, src/{lib,experience}/**
- Migration: 042_public_vehicle_price_signal.sql (NOT applied)
- Env added: none
- Review notes / open questions: Admin history is bounded to the latest 200 records and uses deterministic UTC formatting. Public exposure is aggregate-only, limited to live vehicles on active tenants, and default-off through the tenant theme; raw history never crosses the public API. The owner/admin-only RPC toggles the setting atomically. Claude should decide whether the bot should consume this aggregate later when mentioning recent price drops.

## SCRUM-166 Tenant logo and favicon upload UI
- Status: done
- Files: apps/admin/app/admin/[tenant]/branding/**, apps/admin/lib/brandingAssets.ts, apps/admin/.env.example, packages/types/src/tenantTheme.ts, src/lib/tenantTheme.ts, src/lib/TenantThemeProvider.tsx, src/components/layout/{SiteHeader,SiteFooter}/**
- Migration: none (uses existing tenant-logos bucket from 013_storage_buckets.sql and theme JSON from 019_tenant_theme.sql)
- Env added: NEXT_PUBLIC_PUBLIC_SITE_URL=...
- Review notes / open questions: Owner/admin users can upload an SVG/PNG/WebP logo up to 2 MB plus exact 32×32 and 192×192 PNG/WebP favicons. Stable tenant-owned storage keys are upserted and cache-busted URLs are merged into `theme.branding`; the public header/footer and managed favicon links consume them. The iframe embeds the configured real public origin and reloads after saves. MIME checks remain browser-declared until SCRUM-164 adds server-side content sniffing.

## SCRUM-108 Multi-image vehicle upload to R2
- Status: needs-provisioning(CLOUDFLARE_R2)
- Files: supabase/migrations/043_vehicle_images.sql, packages/db/src/schema.ts, apps/admin/lib/{r2Config,r2Signing,vehicleImages,vehicleImages.server,vehicleImageUploadClient,vehicleImageUploadState}.ts, apps/admin/app/api/vehicles/[id]/images/**, apps/admin/app/admin/[tenant]/vehicles/{VehicleImageUploader.tsx,[id]/page.tsx}, apps/admin/.env.example
- Migration: 043_vehicle_images.sql (NOT applied)
- Env added: R2_ENDPOINT=..., R2_BUCKET_NAME=..., R2_PUBLIC_BASE_URL=..., R2_ACCESS_KEY_ID=..., R2_SECRET_ACCESS_KEY=...
- Review notes / open questions: Authenticated editor+ users can select up to 20 JPEG/PNG/WebP images per vehicle, with three concurrent XHR PUTs and per-file progress. Short-lived SigV4 URLs bind content type and browser-sent content length; confirmation HEAD-verifies R2 metadata before the tenant-scoped row is inserted. Database locking enforces the cap, append order, first primary, vehicle ownership, and canonical key path. Claude must provision a private R2 S3 endpoint, public custom domain, and bucket CORS allowing the admin origin's PUT/Content-Type. Best-effort cleanup handles failed confirmations, but periodic orphan reconciliation is still recommended for abandoned signed uploads and cascade-deleted vehicles; SCRUM-163 must include both confirmed bytes and unconfirmed R2 objects in quota accounting.

## SCRUM-111 Vehicle image association management
- Status: needs-provisioning(CLOUDFLARE_R2)
- Files: supabase/migrations/044_vehicle_image_management.sql, packages/{db,types}/src/**, apps/admin/app/admin/[tenant]/vehicles/**, apps/admin/app/api/vehicles/**, apps/admin/lib/{r2Config,r2Objects.server,vehicleImageManagementClient,vehicleImages}.ts, src/experience/{vehicles,ui}/**, src/lib/pageBuilder/components/VehicleInventory.tsx
- Migration: 044_vehicle_image_management.sql (NOT applied)
- Env added: none (uses SCRUM-108 R2_* names)
- Review notes / open questions: Reorder validates the exact full image set and uses collision-safe two-phase ordering; primary selection and delete/promotion are atomic editor-authorized RPCs. The gallery supports drag ordering plus keyboard-accessible move buttons, a distinct primary control, and confirmed deletion. Metadata is removed before the server attempts R2 deletion so public state stays consistent; failures surface a reconciliation warning. `/api/vehicles` bulk-loads primary rows once per page and degrades to legacy imagery when migration 043 or `R2_PUBLIC_BASE_URL` is unavailable. Vehicle cards, compare, builder inventory, and detail now use managed-primary → special → legacy precedence. Claude should provision an orphan-reconciliation job and ensure vehicle deletion queues all related R2 keys before the metadata cascade.

## SCRUM-136 Bot loyalty acknowledgement
- Status: done
- Files: apps/admin/lib/chatLoyalty.ts, apps/admin/lib/visitorSession.ts, apps/admin/app/api/chat/route.ts, api/{chat.ts,visitor/[...path].ts,visitorSessionCookie.ts}, src/lib/deepseekService.ts
- Migration: none (depends on unapplied loyalty migrations 029, 032, and 033)
- Env added: none (visitor proxy derives the admin origin from existing LUME_CHAT_UPSTREAM_URL)
- Review notes / open questions: The public visitor proxy now keeps the HttpOnly session cookie on the public origin, chat sends credentials, and both proxies forward only `lume_visitor_session` upstream so server-side visitor resolution works without exposing unrelated cookies. Signed-in prompts receive only derived balance/tier and the currently wired inquiry award—never email, IDs, or transactions. Missing sessions or loyalty storage degrade to the anonymous prompt. Gold/Platinum may be acknowledged naturally, but the model is explicitly forbidden from inventing unconfigured benefits; Claude should add benefit metadata before promising priority scheduling or other tier entitlements and connect the saved/referral/chat-session producers before advertising those awards.

## SCRUM-131 Visitor preference learning
- Status: stubbed(flag=VISITOR_PREFERENCE_LEARNING_ENABLED)
- Files: supabase/migrations/045_visitor_profiles.sql, packages/{bot,db,types}/src/**, apps/admin/lib/{visitorPreferences,chatStreamCompletion}.ts, apps/admin/app/api/chat/route.ts, apps/admin/.env.example, src/{lib/deepseekService.ts,components/chat/OllamaChat.tsx}
- Migration: 045_visitor_profiles.sql (NOT applied)
- Env added: VISITOR_PREFERENCE_LEARNING_ENABLED=...
- Review notes / open questions: The canonical chat route now creates real signed-in, tenant-owned sessions; the public client retains the opaque server session ID and Reset starts a new session. Only server-observed user turns from three or more completed sessions are eligible. Learning is deterministic and bounded to known tenant makes, canonical body styles, and clamped USD budgets; raw chat and visitor identity never enter the preference prompt. The feature is default-off pending product/legal consent review. Claude should review whether USD-only budget interpretation matches every tenant, extend the GDPR export path to include profiles/chat before enabling, apply migration 045, then explicitly set the flag only in approved environments.

## SCRUM-153 Bot operational activity steps
- Status: done
- Files: packages/bot/src/{thinkingSteps,index}.ts, packages/types/src/chat.ts, apps/admin/app/api/chat/route.ts, src/lib/deepseekService.ts, src/components/chat/OllamaChat.{tsx,types.ts,thinking.ts,css}
- Migration: none
- Env added: none
- Review notes / open questions: Every executed tool call produces one ordered, fixed operational status, bounded to five per turn. Only a validated aggregate inventory count may influence text; arguments, IDs, summaries, raw results, errors, prompts, and hidden reasoning are never exposed. The public UI presents the steps as an accessible activity list above the pending and completed assistant reply, with reduced-motion support. Status events are emitted after the bounded tool run completes and phase-two streaming is ready, before UI actions and prose; true during-execution progress would require a larger runner callback/route-stream refactor, which Claude can evaluate separately.

## SCRUM-103 Tenant usage tracking
- Status: needs-provisioning(CLOUDFLARE_R2/VERCEL_CRON)
- Files: supabase/migrations/046_usage_tracking.sql, packages/db/src/{schema,usage,index}.ts, apps/admin/lib/{usage.server,r2Config,r2Signing,r2StorageUsage.server,billing}.ts, apps/admin/app/api/{chat,vehicles,leads,bot-actions,cron/storage-usage}/**, apps/admin/app/admin/[tenant]/settings/billing/page.tsx, api/{usage,vehicles,leads}.ts
- Migration: 046_usage_tracking.sql (NOT applied)
- Env added: none (reuses CRON_SECRET and existing R2_* server names)
- Review notes / open questions: Valid, tenant-resolved application requests are atomically counted in the active subscription-period bucket; forbidden origins, invalid payloads, unknown tenants, OPTIONS, and rate-limited chat are not counted. Metering is awaited but fail-open, including before migration rollout. Both direct public Vercel functions and admin routes are instrumented without double-counting the proxied chat path. The bounded nightly route keyset-pages every tenant, lists each slug prefix in R2, includes abandoned/unconfirmed uploads, and never overwrites a snapshot after partial pagination or provider failure. Snapshots are explicitly `r2_storage_bytes`; the billing UI labels them as partial vehicle-image storage and does not compare them to the plan-wide quota until SCRUM-163 adds Supabase buckets. Claude must apply migration 046, grant the R2 credential bucket List permission, and provision a nightly call to `/api/cron/storage-usage`. Tenant slugs currently have no edit path and must remain immutable until historical R2 prefixes are persisted or migrated; otherwise old objects would be undercounted. Counters remain approximate for ambiguous network retries because no request idempotency key exists.

## SCRUM-163 Per-tenant storage quota enforcement and warnings
- Status: done
- Files: supabase/migrations/048_tenant_storage_quota.sql, packages/db/src/{schema,storageQuota,notifications,index}.ts, apps/admin/app/api/cron/storage-usage/route.ts
- Migration: 048_tenant_storage_quota.sql (NOT applied)
- Env added: none (reuses CRON_SECRET)
- Review notes / open questions: Completes the accounting SCRUM-104's notes flagged as pending — `tenant_storage_usage` now records Supabase-bucket bytes alongside R2 bytes (with a DB-enforced sum check) so plan-wide quota comparisons are meaningful, not R2-only. `storage_upload_reservations` counts in-flight/unconfirmed uploads against the quota so a burst of concurrent uploads can't blow past the limit before confirmation lands; reservations are reconciled (expired ones cleared) at the start of every metering run. The nightly cron writes a snapshot, then fires a best-effort, deduped admin notification (`storage.quota_warning`) at the configured warning/exceeded thresholds via the existing notification center — never blocks metering if notification delivery fails. Claude must apply migration 048, then confirm the warning threshold percentages against the plan catalog before relying on the notification in production. NOTE: this ticket was interrupted mid-implementation when Codex hit its usage limit; Claude found and fixed two TypeScript narrowing errors in the cron route (`limitBytes` not narrowed to non-null before arithmetic) before committing — the logic itself was Codex's, only the null-check restructuring is Claude's.

## SCRUM-104 Quota enforcement for public API routes
- Status: done
- Files: supabase/migrations/047_quota_enforcement.sql, packages/db/src/{schema,quota,index}.ts, apps/admin/lib/{quota.server,origin}.ts, apps/admin/app/api/{chat,vehicles,leads}/**, api/{chat,vehicles,leads}.ts, package.json, package-lock.json
- Migration: 047_quota_enforcement.sql (NOT applied)
- Env added: none
- Review notes / open questions: A service-only conditional upsert reserves accepted requests atomically, so concurrent calls cannot exceed a hard limit; missing configuration and billing/RPC failures remain fail-open, and a definite pre-migration missing-function response falls back once to legacy metering. Operational subscription periods are loaded live while plan JSON is cached by plan ID for exactly five minutes. The accepted request that reaches 80% carries `X-Lume-Quota-Warning`; the next request after the allowance returns the exact structured 429, and both public deployment paths expose/forward the header without double-counting the chat proxy. Canonical request keys are `<event_type>`, `monthly_<event_type>`, and `<event_type>_per_month`; generic `vehicles` and `leads` are intentionally not aliases because the current billing UI treats those as inventory/outcome allowances rather than API traffic. Claude should confirm these plan-catalog keys when provisioning the seed rows. Finite enforcement fails open when an operational subscription has a start but no valid future end, preventing an accidental permanent lockout; billing provisioning must set both boundaries. The root vehicle function also intentionally fails open if its existing `SUPABASE_SERVICE_ROLE_KEY` is absent.

## SCRUM-112 Rate limiting for all public API endpoints
- Status: done
- Files: apps/admin/lib/rateLimit.ts, apps/admin/lib/rateLimit.test.ts, apps/admin/app/api/{leads,bot-actions,gdpr/export,gdpr/delete,visitor/signup,visitor/login,visitor/logout,visitor/me,visitor/loyalty,visitor/chat-history}/route.ts
- Migration: none
- Env added: none
- Review notes / open questions: Extends the existing in-memory sliding-window limiter (chat + upload already covered) to every remaining public route with per-scope one-minute budgets: signup 5, login 10, gdpr export/delete 5, leads 10, bot-actions 30, logout/loyalty 30, me/chat-history 60. Guards run after the origin check (cheap rejection first) and before tenant resolution, returning a standard 429 with Retry-After + route-appropriate CORS headers. Limits are keyed by scope + first x-forwarded-for hop. Still per-instance in-memory by design — the Redis/Upstash shared store remains the documented upgrade path (SCRUM-151's infrastructure could host it later). Implemented by Claude, not Codex.

## SCRUM-164 Per-bucket MIME and size whitelist with content sniffing
- Status: done
- Files: packages/db/src/{uploadPolicy,uploadPolicy.test,index}.ts, apps/admin/lib/{assets,brandingAssets}.ts
- Migration: none
- Env added: none
- Review notes / open questions: One shared policy table (`BUCKET_UPLOAD_POLICIES`) covers all four tenant buckets (logos 2 MB images, media 10 MB images, csvs 20 MB text, 3d-models 100 MB glTF/octet-stream). `validateUploadWithBytes` enforces declared MIME + size AND magic-byte agreement (PNG/JPEG/WebP/GIF/SVG/glTF signatures); non-sniffable text types get a negative check so a binary can't be smuggled under a CSV label. Wired into the two Supabase-direct upload paths: tenant media (previously ZERO validation) and branding assets (previously declared-type only — closes the gap SCRUM-166's notes flagged). Vehicle-image R2 uploads keep their existing declared-type binding + post-upload HEAD verification; true byte sniffing there would require proxying the upload through the server, which SCRUM-108's signed-PUT design intentionally avoids. Validation runs in the browser client before upload; a malicious API-level actor bypassing the admin UI is still constrained by storage RLS but not by sniffing — server-side enforcement would need an Edge Function (SCRUM-165's ClamAV hook is the natural place). Implemented by Claude, not Codex.

## SCRUM-106 Tenant API key management (generate, scope, revoke)
- Status: done
- Files: supabase/migrations/049_tenant_api_keys.sql, packages/db/src/schema.ts, apps/admin/lib/{apiKeys,apiKeys.test}.ts, apps/admin/app/admin/[tenant]/settings/api-keys/{page.tsx,actions.ts,ApiKeysClient.tsx}, apps/admin/components/admin-shell.tsx, apps/admin/app/api/leads/route.ts
- Migration: 049_tenant_api_keys.sql (NOT applied)
- Env added: none
- Review notes / open questions: Keys are `lume_sk_<64 hex>`; only the SHA-256 is stored (raw shown once at creation, copy-to-clipboard UI). Owner/admin-only RLS for select/insert/update; revocation sets revoked_at (rows never deleted, audit-log entries on create/revoke). Two scopes exist today: `leads:write` (wired — a Bearer key on POST /api/leads authenticates server-to-server callers: tenant pinned to the key, source forced to "api", origin/Turnstile checks skipped, quota + rate limits still apply) and `vehicles:read` (defined in the check constraint and UI but not yet consumed by a route — wire it when a partner-facing vehicles endpoint needs it, or drop it at review). A presented-but-invalid key 401s rather than falling back to browser rules, so a revoked key cannot silently downgrade. Implemented by Claude, not Codex.

## SCRUM-200 Cookie consent backend + analytics opt-in (D-NEW-12)
- Status: done
- Files: supabase/migrations/050_consent_events.sql, packages/db/src/schema.ts, apps/admin/lib/rateLimit.ts, apps/admin/app/api/consent/route.ts, src/lib/consentReporting.ts, src/components/CookieBanner/{CookieBanner,CookieBanner.test}.tsx, src/components/layout/SiteFooter/SiteFooter.tsx
- Migration: 050_consent_events.sql (NOT applied)
- Env added: none
- Review notes / open questions: Completes the ops half of the banner SCRUM-207 shipped. (1) Consent versioning: choices persist as {choice, version, at}; bumping COOKIE_CONSENT_VERSION re-prompts returning visitors; legacy bare-string values still honored at v1. (2) "Cookie preferences" footer link re-opens the banner via a window event so visitors can change their mind (a GDPR requirement the banner previously lacked). (3) Anonymous tenant-scoped consent ledger: fire-and-forget POST /api/consent inserts {choice, version} only — deliberately NO ip/user-agent/visitor linkage so the compliance record can't become tracking; member-read RLS, service-role write, rate-limited 10/min. Analytics gating itself was already in App.tsx (accepted → <Vercel Analytics>). No admin UI for accept/reject rates yet — one query away when wanted. Implemented by Claude, not Codex.

## SCRUM-113 Error monitoring & observability
- Status: done
- Files: apps/admin/lib/{observability,observability.test}.ts, apps/admin/app/api/{gdpr/export,gdpr/delete,consent}/route.ts, apps/admin/.env.example
- Migration: none
- Env added: ERROR_WEBHOOK_URL= (optional)
- Review notes / open questions: Provider-agnostic by design — no vendor SDK. captureError emits one structured JSON line to stderr (Vercel log drains + `vercel logs` consume it directly) and optionally forwards to any JSON webhook (ERROR_WEBHOOK_URL, 3s timeout, best-effort). Identical signatures (scope+message) dedupe for 60s with a suppressed-count carried on the next emission, so a hot failure loop can't flood collectors. withRouteErrorCapture wraps a handler: unhandled throws are captured and answered with a generic 500 that never leaks stack details. Wired into the gdpr export/delete and consent routes as the reference pattern; remaining routes keep their existing targeted console.error calls and can adopt captureError incrementally — swapping in Sentry later is one new transport function. Implemented by Claude, not Codex.

## SCRUM-194 Resend integration and @lume/email package
- Status: needs-provisioning(RESEND)
- Files: packages/email/**, supabase/migrations/051_tenant_email_sender.sql, packages/db/src/schema.ts, apps/admin/.env.example, package-lock.json
- Migration: 051_tenant_email_sender.sql (NOT applied)
- Env added: RESEND_API_KEY=..., RESEND_FROM_EMAIL=...
- Review notes / open questions: The new package keeps validation and shared contracts in `@lume/email` while all provider, rendering, and environment access stays behind the server-only `@lume/email/server` export. Missing credentials return a typed no-op before rendering or network access; sends require a tenant-scoped idempotency key and include non-PII tenant/template tags. Migration 051 adds an optional owner/admin-protected sender address to existing tenant settings; Claude must apply it and ensure only a Resend-verified domain is saved before enabling an override. Template content is intentionally SCRUM-195, and webhook event persistence, DKIM provisioning, and suppression lookup storage remain SCRUM-196. Deployment must use Node 20+ for the pinned Resend and React Email renderer versions.

## SCRUM-195 Welcome, password reset, and tenant invitation email templates
- Status: needs-provisioning(SUPABASE_AUTH_HOOK)
- Files: packages/email/src/templates/**, packages/email/package.json
- Migration: none
- Env added: none
- Review notes / open questions: Three pure, dark LUME-branded React email templates now expose stable descriptors (`welcome`, `password-reset`, `tenant-invited`) from `@lume/email/templates`, accessible CTA links plus plaintext fallbacks, and strict HTTPS action-URL validation with loopback-only HTTP for development. Welcome mirrors the existing five-step onboarding checklist; invites use the real tenant roles, ISO expiry timestamps, and current `/invite/<token>` flow; reset copy never exposes a token outside its CTA URL. Actual sends are deliberately not wired here: welcome should run only when tenant provisioning returns `created=true`, team invites currently originate in a client component and need a server action, and the repo has no forgot/reset landing flow or Supabase Send Email hook. Claude must not enable a recovery-only hook because a custom hook replaces Supabase's built-in confirmation delivery for every auth email action; provision a complete hook/fallback flow first.

## SCRUM-196 Email DKIM and bounce/complaint webhook handling
- Status: needs-provisioning(RESEND_DNS+WEBHOOK)
- Files: supabase/migrations/052_email_delivery_events.sql, packages/email/{README.md,src/{config,server,webhook}*}, packages/db/src/{schema,emailEvents,emailEvents.test,index}.ts, apps/admin/app/api/resend-webhook/route.ts, apps/admin/lib/{boundedRequestBody,boundedRequestBody.test,rateLimit,rateLimit.test}.ts, apps/admin/{package.json,.env.example}, package-lock.json
- Migration: 052_email_delivery_events.sql (NOT applied)
- Env added: RESEND_WEBHOOK_SECRET=...
- Review notes / open questions: The signed Node route reads the raw body once, verifies Resend's `svix-*` headers locally, accepts only delivered/bounced/complained events carrying the outbound tenant tag, and atomically deduplicates by provider event ID. Only case-insensitive `Permanent` bounces enter the service-only suppression ledger; transient/undetermined bounces and complaints are logged without suppressing, matching Jira's hard-bounce policy. Missing configuration is a safe 503, invalid signatures never reach storage, unknown tenants are acknowledged without retry, and persistence failures return 500 so Resend retries. DNS is deliberately manual: publish the exact SPF/DKIM records Resend supplies and begin DMARC at `p=none`; never reuse website `tenant_domains.verified`. Claude must apply migration 052, decide root `lume.app` versus a dedicated sending subdomain, provision the three-event webhook, store its signing secret, and only then populate tenant sender overrides for a Resend-verified domain. SCRUM-172 must inject the exported fail-closed `isEmailRecipientSuppressed` lookup when constructing its sender; otherwise the ledger is recorded but not enforced.

## SCRUM-172 Email notification to tenant on new lead
- Status: needs-provisioning(RESEND+VERCEL_CRON)
- Files: supabase/migrations/053_lead_email_notifications.sql, packages/db/src/{schema,leadEmail,index}*, packages/email/src/templates/{LeadCreatedEmail,LeadDigestEmail,leadEmails.test,index}*, apps/admin/lib/{leadEmailPolicy,leadEmailNotifications.server}*, apps/admin/app/{api/leads,api/cron/lead-email-digests,admin/[tenant]/team}/**, packages/email/package.json, package-lock.json
- Migration: 053_lead_email_notifications.sql (NOT applied)
- Env added: none (reuses RESEND_API_KEY, RESEND_FROM_EMAIL, and CRON_SECRET)
- Review notes / open questions: Notifications are default-off and tenant-configurable from Team settings: owners are mandatory, selected roles and the assigned member are additive, and an optional pool address receives unassigned leads. Instant sends are best-effort after durable lead capture and never fail the public request. Hourly mode atomically queues bounded service-only batches, claims due/stale leases with skip-locked concurrency, retries four times, and sends each recipient separately with tenant/recipient-scoped idempotency so addresses are never disclosed across recipients. Both modes enforce the hard-bounce suppression ledger and include contact details, a bounded message preview, vehicle context, and admin links. Claude must apply migration 053, schedule `/api/cron/lead-email-digests` at least hourly with `CRON_SECRET`, and enable a tenant only after SCRUM-194/196 Resend provisioning. Review whether owners should remain mandatory or become deselectable; Jira says owners are recipients, so this implementation keeps them mandatory.

## SCRUM-190 Vercel API integration for custom domains
- Status: needs-provisioning(VERCEL)
- Files: supabase/migrations/054_tenant_domain_vercel_config.sql, packages/db/src/{schema,vercel,index}*, apps/admin/lib/vercelDomains.server.ts, apps/admin/app/admin/[tenant]/domains/{actions,DomainsClient,page}.tsx, apps/admin/.env.example
- Migration: 054_tenant_domain_vercel_config.sql (NOT applied)
- Env added: VERCEL_ADMIN_TOKEN=..., VERCEL_PROJECT_ID=..., VERCEL_TEAM_ID=... (optional team scope)
- Review notes / open questions: The dependency-free provider client follows the current official project-domain endpoints (v10 add; v9 get/verify/remove; v6 DNS config), uses bounded normalized responses, an 8-second timeout, team scoping, typed errors, and injectable fetch tests. Mutations moved from the browser to an editor-authorized server action so the token stays server-only; provider add happens only after a read-only DNS configuration check, and a failed database insert triggers best-effort provider rollback. Removal is idempotent for provider 404 and does not delete the tenant record on other provider failures. Missing token/project configuration performs no network request and preserves the existing database-only TXT workflow. Claude must apply migration 054, create a least-scope expiring Vercel access token, and confirm the production public-site project/team IDs before setting env values. SCRUM-192 will surface Vercel verification challenges and add polling; SCRUM-193 will add atomic plan-limit enforcement around this server action.

## SCRUM-192 Domain verification status polling
- Status: needs-provisioning(VERCEL_CRON+RESEND)
- Files: supabase/migrations/055_domain_verification_polling.sql, packages/db/src/{schema,domainVerification,index}*, packages/types/src/tenantDomain.ts, packages/email/src/templates/{DomainVerificationEmail,index}*, apps/admin/lib/{domainVerification.server,domains,domains.test,rateLimit}.ts, apps/admin/app/api/{domains/[id]/verify,cron/domain-verification}/route.ts, apps/admin/app/admin/[tenant]/domains/{actions,DomainsClient}.tsx
- Migration: 055_domain_verification_polling.sql (NOT applied)
- Env added: none (reuses VERCEL_ADMIN_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID, CRON_SECRET, and Resend configuration)
- Review notes / open questions: A service-only skip-locked RPC leases up to 50 pending domains that have not been checked for five minutes, allowing a five-minute cron without overlapping provider calls. The shared verifier registers legacy database-only rows on first managed check, retries expected Vercel challenge 400s as status reads, persists bounded provider/DNS state, marks unverified domains failed after 24 hours, and remains recoverable through the same-origin editor-authorized POST route. The UI surfaces Vercel's exact challenges, routing recommendations, pending/failed/verified states, and an accessible manual check. Verified/failed transitions email tenant owners separately with bounce suppression and stable idempotency; transport failures occur before the state transition so the cron retries, while absent Resend configuration is the intentional safe no-op. Verified transitions also use the existing deduped admin notification. Claude must apply migration 055 after 054 and schedule `/api/cron/domain-verification` every five minutes with `CRON_SECRET`. Existing already-verified legacy rows remain `verification_status=null` by design to honor the additive/no-data-mutation rule; application mapping derives them as verified from the existing boolean.

## SCRUM-193 Per-plan custom domain limits
- Status: done
- Files: supabase/migrations/056_custom_domain_plan_limits.sql, packages/db/src/{schema,domainLimits,index}*, apps/admin/app/admin/[tenant]/domains/{page,actions,DomainsClient}.tsx
- Migration: 056_custom_domain_plan_limits.sql (NOT applied)
- Env added: none
- Review notes / open questions: Free/unsubscribed and trialing tenants receive zero custom domains, Pro receives one, and Enterprise is unlimited; an integer `plans.limits.custom_domains` value overrides name-based Pro/Enterprise defaults for active operational subscriptions (aliases `custom_domain_limit` and `domains` are accepted for compatibility). Unknown plans fail closed at zero. The UI shows usage/allowance and prevents an obvious over-limit call, the server performs a read-only preflight before touching Vercel, and the authoritative service-only RPC takes a tenant advisory transaction lock, recounts domains, and inserts atomically. Concurrent Pro additions therefore produce one winner; a provider domain created by a losing request is removed best-effort. Claude must apply migration 056 after 055 and populate canonical `custom_domains` plan limits explicitly during plan catalog provisioning; relying on plan-name fallback should be transitional only. Existing domains are never deleted if a tenant downgrades below its allowance, but no additional domains can be added until usage is back under the new limit.

## SCRUM-151 Conversation memory with Upstash fallback
- Status: needs-provisioning(UPSTASH)
- Files: packages/bot/src/{conversationMemory,conversationMemory.test,index}.ts, apps/admin/lib/{conversationMemory.server,conversationMemory.server.test}.ts, apps/admin/app/api/chat/route.ts, apps/admin/{package.json,.env.example}, package-lock.json
- Migration: none
- Env added: UPSTASH_REDIS_REST_URL=..., UPSTASH_REDIS_REST_TOKEN=...
- Review notes / open questions: Signed-in visitor memory is keyed by an opaque SHA-256 of `(tenant_id, visitor_id)`, retains exactly the last 20 user/assistant messages and five bounded tool results, and expires after 24 hours. The provider-neutral store interface ships with a deterministic in-memory implementation, an Upstash adapter, and a resilient wrapper that keeps the fallback warm and uses it on provider errors or cache misses. Chat merges overlapping client/remembered transcripts without duplicate turns, supplies a 12,000-character bounded recent-tool data appendix for follow-ups, and writes only after a completed assistant response; anonymous visitors retain the existing client-side transcript only because they have no stable visitor ID. Redis failures never fail chat and are captured through observability. The Vercel storage guidance favors Marketplace-provisioned `@upstash/redis`; Claude should install an Upstash Redis integration and inject the two server-only env values. The Upstash adapter uses read/modify/write snapshots, so truly simultaneous turns by the same visitor are last-writer-wins; if that becomes common, replace `append` with a Lua/list transaction while preserving the interface.

## SCRUM-165 Antivirus scan on upload
- Status: needs-provisioning(CLAMAV+SUPABASE_EDGE_FUNCTION)
- Files: supabase/migrations/057_tenant_asset_antivirus.sql, supabase/functions/{_shared/antivirusPolicy*,scan-upload/**}, packages/db/src/schema.ts, apps/admin/.env.example
- Migration: 057_tenant_asset_antivirus.sql (NOT applied)
- Env added: ANTIVIRUS_WEBHOOK_SECRET=..., CLAMAV_SCAN_URL=..., CLAMAV_SCAN_TOKEN=...
- Review notes / open questions: The repo has no `tenant_assets` table, so the implementation adds a service-written `tenant_asset_scans` ledger keyed to the real Storage bucket/object plus a private, policy-free `tenant-quarantine` bucket. The Edge Function accepts authenticated Storage INSERT webhooks, derives tenant scope only from a UUID path prefix, skips the existing image-only buckets, scans CSV/PDF content up to 25 MB through a documented raw-byte ClamAV HTTP contract, and records clean/infected/error/skipped/unavailable states. Infected bytes are written to a deterministic quarantine key before the source is removed, and the tenant receives a deduped existing storage-warning notification; scanner/webhook absence never changes current upload success. SCRUM-164 byte/MIME validation remains the first line and is not weakened. Claude must apply migration 057, deploy the function with JWT verification, set Supabase Function secrets, provision a filtered `storage.objects` INSERT webhook, and EICAR-test the complete quarantine path. No Deno CLI is installed in this workspace, so the pure routing policy is Vitest-covered but Claude should run `deno check`/a local Edge Function invocation during provisioning. The existing notification taxonomy has no malware type; this safely reuses `storage.quota_warning` rather than destructively replacing its check constraint, and Claude may add a dedicated additive notification taxonomy later.

## SCRUM-176 Optional HubSpot/Pipedrive webhook integration
- Status: needs-provisioning(WEBHOOK_CRON)
- Files: supabase/migrations/058_crm_webhook_delivery.sql, packages/db/src/{schema,webhooks,webhooks.test,webhookQueue,index}*, apps/admin/lib/{crmWebhooks,webhookCredentials.server}*, apps/admin/app/{api/leads,api/cron/webhook-deliveries,admin/[tenant]/settings/integrations}/**, apps/admin/components/admin-shell.tsx, apps/admin/.env.example
- Migration: 058_crm_webhook_delivery.sql (NOT applied)
- Env added: WEBHOOK_ENCRYPTION_KEY=... (reuses CRON_SECRET)
- Review notes / open questions: Owner/admin users can configure multiple HubSpot, Pipedrive, or custom public HTTPS endpoints, pause/remove them, set 1–10 retry delays, and view recent/dead-letter deliveries. Signing secrets are accepted once, AES-256-GCM encrypted with a 32-byte base64 server key, and stored only in the existing deny-all credential table. New leads enqueue one provider-neutral signed envelope per enabled endpoint after durable capture; this never fails the lead response. The service-only worker claims due/stale jobs with skip-locked leases, HMAC-signs stable delivery IDs, uses bounded retries, disables redirects, pre-resolves DNS to reject private addresses, and leases completion updates to the claimed attempt. The existing delivery history is the admin-visible dead-letter alert. Claude must apply migration 058, generate/store `WEBHOOK_ENCRYPTION_KEY`, schedule `/api/cron/webhook-deliveries` at least once per minute with `CRON_SECRET`, and test receiver-side deduplication using `X-Lume-Delivery`. DNS is still resolved again by the platform HTTP client after the explicit safety lookup, so a hostile authoritative DNS server could theoretically rebind between checks; review whether production requires a network egress proxy with pinned DNS. Existing SCRUM-201 rows default to `custom` and the standard retry schedule.

## SCRUM-109 AI-generated vehicle image descriptions
- Status: needs-provisioning(ANTHROPIC+VERCEL_CRON)
- Files: supabase/migrations/059_vehicle_image_descriptions.sql, packages/db/src/{schema,imageDescriptions,index}*, packages/types/src/vehicle.ts, apps/admin/lib/vehicleImageDescriptions.server*, apps/admin/app/api/{vehicles/[id]/images,vehicles,chat,cron/vehicle-image-descriptions}/route.ts, src/experience/{vehicles/catalog.ts,ui/{VehiclesPage,VehicleDetailPage}}/**, src/lib/pageBuilder/components/VehicleInventory.tsx, apps/admin/.env.example
- Migration: 059_vehicle_image_descriptions.sql (NOT applied)
- Env added: ANTHROPIC_API_KEY=..., ANTHROPIC_MODEL=claude-haiku-4-5-20251001 (reuses CRON_SECRET and R2 configuration)
- Review notes / open questions: Successful image confirmation schedules only a durable enqueue through Next `after()`, so neither the queue write nor model call delays the upload response. A service-only skip-locked worker fetches the exact confirmed R2 object with a one-minute signed GET, verifies stored type/size, sends at most 5 MB as an Anthropic Messages API base64 image block, retries three times, and atomically leases completion/failure state. The model prompt asks for visible make/model, color, angle, body style, and notable features without hidden specs or sales copy; the exact returned text blocks are stored (joined only if Anthropic emits multiple text blocks) in `vehicle_images.ai_description`. Completed primary-image descriptions flow into the public vehicles API, accessible ALT text in inventory/detail views, and bounded vehicle-image RAG context for matched chat inventory. Missing Anthropic/R2 config returns 503 before claiming jobs and never affects uploads. Claude must apply migration 059, provision the Anthropic key/model, schedule `/api/cron/vehicle-image-descriptions`, and confirm the ticketed model ID is enabled for the account. Images over 5 MB remain valid uploads but will exhaust description retries and show `failed`; if coverage for the existing 10 MB upload ceiling is required, add a resize proxy or use a provider-supported URL ingestion path after privacy review.
