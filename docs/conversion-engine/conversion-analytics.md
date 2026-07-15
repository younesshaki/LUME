# Consent-aware conversion analytics

Phase 3 is stacked on persistent saved vehicles. Migration `063_conversion_events.sql`
is additive and **not applied** by this branch.

## Event model and privacy

The finite event dictionary is enforced server-side. Browser events are
`analytics` and only sent after the versioned cookie choice is `accepted`.
The ingestion API accepts at most 20 events, validates tenant/vehicle scope,
uses per-tenant event UUID idempotency, caps metadata to flat scalar values,
and never accepts arbitrary request bodies, contact details, IP addresses,
user agents, passwords, session tokens, or chat content as metadata. Browser
campaign fields are explicit and bounded (`utm_*` plus referring origin only;
not a referring URL path or query string).

The anonymous identifier is a first-party opaque UUID in `sessionStorage`.
It is not a fingerprint, is not cross-tenant portable in server storage, and
expires with the browser session. Operational events are emitted only after a
server-confirmed lead, visitor account, or saved vehicle action.

## Aggregation and retention

Admin funnel reads use `tenant_conversion_funnel`. Migration 064 adds
`tenant_conversion_report`, which checks tenant membership inside the SQL
function and returns funnel, vehicle, source/campaign, identity, and
view-to-lead aggregates rather than draining raw event rows into the Admin
application. The UI supports 7, 30, and 90-day windows. Suggested retention is
13 months; a separately reviewed maintenance job may run `delete from
conversion_events where created_at < now() - interval '13 months'` only after a
product retention decision.

## Rollback and validation

Migration `064_conversion_analytics_report.sql` is additive and **not
applied** by this branch. Rollback is feature-level: remove the browser
emitter/proxy and report UI, leaving the append-only ledger intact. Do not drop
analytics data without a reviewed data retention decision. Manually test
accepted/rejected consent, browser event failure not blocking navigation, same
event UUID idempotency, cross-tenant vehicle rejection, trusted lead event
creation, attribution fields, and tenant-isolated Admin report values.
