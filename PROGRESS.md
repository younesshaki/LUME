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
