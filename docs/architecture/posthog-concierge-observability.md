# PostHog and Concierge Observability

## Purpose

LUME uses two deliberately separate data paths for concierge improvement:

1. **PostHog** records small operational and UX events: chat opened, a turn
   starts/completes/fails, a response rating, and whether a vetted action was
   dispatched or suppressed as stale.
2. **`public.concierge_traces`** is LUME-owned, tenant-scoped storage for the
   exact visitor message and final assistant answer needed to investigate an
   incorrect response and later build evaluation/training datasets.

Raw prompts, raw assistant answers, tool-result payloads, lead details, email
addresses, phone numbers and action arguments must never be sent to PostHog.

## Internal full-fidelity mode

The database trace store is off by default. It writes raw conversation text
only if **all three** configuration gates are deliberate:

```text
LUME_INTERNAL_TESTING=1
LUME_CONCIERGE_TRACE_MODE=internal_full
LUME_INTERNAL_TRACE_TENANT_IDS=<exact comma-separated tenant UUIDs>
```

The third gate is an exact UUID allowlist, not a tenant slug or wildcard. A
missing, malformed or non-listed tenant fails closed. The table has RLS enabled
with no `anon` or `authenticated` grants/policies; trusted server code writes
with the Supabase service role only. Migration 088 creates the table but has
not been applied by this change.

For a future external tenant, leave these variables disabled. Consent and
retention controls must be added before turning raw traces on for anyone other
than LUME's explicit internal test tenants.

## PostHog configuration

The public Vite deployment requires only publishable browser variables:

```text
VITE_POSTHOG_ENABLED=1
VITE_POSTHOG_PROJECT_TOKEN=<PostHog project API key>
VITE_POSTHOG_HOST=https://us.i.posthog.com
VITE_POSTHOG_SESSION_REPLAY=0
```

The Next.js admin deployment uses separate server-only settings:

```text
POSTHOG_PROJECT_TOKEN=<same PostHog project API key>
POSTHOG_HOST=https://us.i.posthog.com
```

`VITE_POSTHOG_SESSION_REPLAY` is opt-in. If enabled, the LUME client still
sets `maskAllInputs: true` and `maskTextSelector: "*"`; it is useful for
layout/click reproduction but cannot become a backdoor for transcript capture.

## Event taxonomy

Public browser events:

- `lume_concierge_opened`
- `lume_concierge_turn_started`
- `lume_concierge_turn_metadata`
- `lume_concierge_turn_completed`
- `lume_concierge_turn_failed`
- `lume_concierge_turn_aborted`
- `lume_concierge_action_dispatched`
- `lume_concierge_action_suppressed`
- `lume_concierge_response_rated`
- `lume_concierge_reset`

Admin server events:

- `lume_admin_concierge_turn_started`
- `lume_admin_concierge_intent_resolved`

Internal trace completion event:

- `lume_concierge_trace_recorded`

All properties are scalar operational metadata only. `turn_id` is an opaque
per-turn UUID for correlation, never an account, visitor or lead identifier.

## Rollout and verification

1. Apply migration 088 to the explicitly approved environment only.
2. Configure the browser variables on the public Vercel project and server
   variables on `lume-admin`; do not put a secret or model-provider key in a
   `VITE_*`/`NEXT_PUBLIC_*` variable.
3. Initially enable internal full traces only for LUME's test tenant UUID.
4. Send a concierge turn and verify exactly one `concierge_traces` row exists
   for its request ID, while PostHog shows lifecycle events but no message text.
5. Test an ordinal/navigation action and an aborted turn: PostHog should show
   dispatch/suppression, and only the active turn may mutate the page.
6. Before onboarding external dealers, keep raw trace gates off and review
   consent, retention, access and deletion workflows.
