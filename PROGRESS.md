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
