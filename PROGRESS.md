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
