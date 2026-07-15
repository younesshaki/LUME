# Customer 360 profiles

Phase 4 is stacked on saved vehicles and conversion analytics. It adds
`/admin/[tenant]/customers/[visitorId]` and links directory names to that safe,
tenant-scoped detail route.

The route first verifies the operator's tenant membership/platform role using
the regular RLS client. Only then does it use the server-only service client to
read an explicit visitor projection: id, name, email, and timestamps. It never
selects password hashes or visitor-session tokens. Every related query includes
the resolved tenant ID and visitor ID; inaccessible IDs return not-found.

The profile read model uses bounded, tenant-scoped queries only: 25 saved
vehicles, leads, chat sessions, and loyalty transactions; 50 conversion events
and normalized timeline entries; and 500 session-message references to show a
recent message count without reading chat content. Vehicle details are fetched
in one tenant-scoped batch, never one query per panel row.

It includes saved vehicles, vehicle-interest summaries (first/last view, view
count, saved/inquiry state), leads, recent chat-session counts, loyalty balance
and transactions, and a bounded normalized activity timeline. The timeline is
newest-first and combines account creation, consented conversion events, saves,
lead creation/status activity, chat starts, and loyalty transactions. Raw event
metadata and chat messages are not selected or serialized.

The engagement label is deterministic and explicitly not a purchase prediction:
it caps recent vehicle-view, save, lead, and chat-session counts. With no
consented conversion events it reports `Insufficient activity data` rather than
inventing a zero score. It intentionally omits notes and salesperson assignment
because there is not yet a reviewed customer-specific authorization/write model.

No migration is introduced in this phase. Rollback is simply removing the
directory link and detail route. Manual checks: authorized tenant access,
cross-tenant not-found behavior, absence of sensitive visitor columns in page
responses, legacy email-only loyalty fallback, lead and vehicle links,
sold/unavailable saved items, no-consent interest state, and bounded timeline
ordering.
