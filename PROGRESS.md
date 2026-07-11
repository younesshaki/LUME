## SCRUM-102 Billing schema migration (plans, subscriptions, invoices)
- Status: done
- Files: supabase/migrations/030_billing_schema.sql, packages/db/src/schema.ts
- Migration: 030_billing_schema.sql (NOT applied)
- Env added: none
- Review notes / open questions: Jira requested seeding Free, Starter, and Pro inside the migration, but the sweep guardrail forbids migration data mutation. Claude should decide whether plan bootstrap belongs in a separate reviewed seed script or provider-sync job.
