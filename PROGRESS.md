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
