# Customer 360 profiles

Phase 4 is stacked on saved vehicles and conversion analytics. It adds
`/admin/[tenant]/customers/[visitorId]` and links directory names to that safe,
tenant-scoped detail route.

The route first verifies the operator's tenant membership/platform role using
the regular RLS client. Only then does it use the server-only service client to
read an explicit visitor projection: id, name, email, and timestamps. It never
selects password hashes or visitor-session tokens. Every related query includes
the resolved tenant ID and visitor ID; inaccessible IDs return not-found.

The first profile read model includes bounded saved vehicles, linked leads,
chat-session counts, loyalty balance/tier, and a bounded consented activity
timeline. It intentionally omits notes and salesperson assignment because there
is not yet a reviewed customer-specific authorization/write model. It also does
not claim an AI purchase score.

No migration is introduced in this phase. Rollback is simply removing the
directory link and detail route. Manual checks: authorized tenant access,
cross-tenant not-found behavior, absence of sensitive visitor columns in page
responses, lead links, sold/unavailable saved items, and no-consent timeline
empty state.
