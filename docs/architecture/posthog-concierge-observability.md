# PostHog and Concierge Observability

## Purpose

LUME uses two complementary data paths for concierge improvement:

1. **PostHog** records browser replay, autocapture, operational events and the
   full user/assistant conversation window for model training.
2. **`public.concierge_traces`** is LUME-owned, tenant-scoped storage for the
   exact visitor message and final assistant answer needed to investigate an
   incorrect response and later build evaluation/training datasets.

During LUME's current internal training phase, raw prompts, raw assistant
answers, conversation windows, action payloads, tool-result payloads, state,
retrieval and model metadata are intentionally captured in PostHog and LUME's
service-role-only `concierge_traces` table.

## Full-fidelity training capture

Each finished turn creates two PostHog events: `lume_concierge_transcript` in
the browser (which is correlated with that browser's replay) and
`lume_concierge_training_trace` on the trusted server. Together with the
service-role-only `concierge_traces` table, they preserve the complete
conversation window, exact response, state before/after, emitted actions, tool
outcomes, retrieval context and model metadata. The work is scheduled after
the visitor response and never uses a browser Supabase client.

## PostHog configuration

The public Vite deployment requires only publishable browser variables:

```text
VITE_POSTHOG_ENABLED=1
VITE_POSTHOG_PROJECT_TOKEN=<PostHog project API key>
VITE_POSTHOG_HOST=https://us.i.posthog.com
VITE_POSTHOG_SESSION_REPLAY=1
```

The Next.js admin deployment uses separate server-only settings:

```text
POSTHOG_PROJECT_TOKEN=<same PostHog project API key>
POSTHOG_HOST=https://us.i.posthog.com
```

LUME enables PostHog autocapture, page analytics, session replay and unmasked
chat capture. Text and non-password input content is visible in replay, and
each completed chat turn is also stored as a searchable custom PostHog event.


## Event taxonomy

Public browser events:

- `lume_concierge_opened`
- `lume_concierge_turn_started`
- `lume_concierge_turn_metadata`
- `lume_concierge_turn_completed`
- `lume_concierge_turn_failed`
- `lume_concierge_turn_aborted`
- `lume_concierge_transcript`
- `lume_concierge_action_dispatched`
- `lume_concierge_action_suppressed`
- `lume_concierge_response_rated`
- `lume_concierge_reset`

Admin server events:

- `lume_admin_concierge_turn_started`
- `lume_admin_concierge_intent_resolved`

Server training events:

- `lume_concierge_trace_recorded`
- `lume_concierge_training_trace`

The transcript events intentionally include raw content and structured context.
`turn_id` is an opaque per-turn UUID for correlation, never an account, visitor
or lead identifier.

## Rollout and verification

1. Migration 088 must be present in the target environment.
2. Configure the browser variables on the public Vercel project and server
   variables on `lume-admin`; do not put a secret or model-provider key in a
   `VITE_*`/`NEXT_PUBLIC_*` variable.
3. Send a concierge turn and verify exactly one `concierge_traces` row exists
   for its request ID and PostHog contains both transcript events with message
   text.
4. Test an ordinal/navigation action and an aborted turn: PostHog should show
   dispatch/suppression, and only the active turn may mutate the page.
