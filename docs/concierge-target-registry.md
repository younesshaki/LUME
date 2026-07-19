# Concierge Target Registry

Status: implementation complete on `feature/concierge-target-registry`; migration
`073_concierge_targets.sql` is intentionally **unapplied**.

## Why this exists

The concierge should move a visitor toward a useful website destination without
giving a model arbitrary routing or DOM access. A target is a small, validated
piece of tenant configuration that connects conversational intent to a public
route, section, form, or modal.

This keeps one generic action contract:

```json
{
  "type": "navigate-target",
  "targetKey": "vehicle-detail",
  "params": { "vehicleId": "grounded-inventory-id" }
}
```

New website surfaces do not require new action types.

## Architecture

```text
Admin Targets screen
  -> owner/admin server action
  -> validated tenant override (concierge_targets)
  -> enabled registry loaded by /api/chat
  -> bounded, injection-resistant prompt vocabulary
  -> model emits inline navigate-target JSON
  -> server validates + resolves + deduplicates + enriches
  -> structured SSE action (JSON line is removed from prose)
  -> App navigates first
  -> registered section/form/modal activates after mount
  -> lead submission retains target + chat attribution
```

The implementation remains model-agnostic. The action extractor consumes the
OpenAI-compatible streamed text deltas already used by the chat route; it does
not depend on provider-specific `tool_calls`.

## Data model

Migration `supabase/migrations/073_concierge_targets.sql` adds
`public.concierge_targets`:

- `tenant_id`
- stable `key`
- `label`
- `kind`: `route | section-anchor | form | modal`
- safe root-relative `destination`
- `ai_description`
- `is_conversion`
- `enabled`
- bounded `example_prompts`
- `sort_order`
- actor and timestamp fields

Security properties:

- RLS is enabled.
- Authenticated members may `SELECT` rows for tenants returned by
  `tenant_ids_for_current_user()`.
- There are no browser insert, update, or delete policies.
- Authenticated is granted read only; service role is the only writer.
- Admin mutations independently require owner/admin through
  `user_has_tenant_role`.
- The server resolves the tenant ID from the authenticated tenant slug. It never
  accepts a tenant ID from the mutation payload.
- The `(tenant_id, enabled, sort_order, key)` index supports the chat hot path.
- Stored tenant overrides/custom targets are capped at 50 rows, and prompt
  injection is independently capped at 50 enabled targets.

### Defaults and overrides

Product defaults live once in the runtime-safe shared registry in
`packages/types/src/conciergeTargets.ts`. Database rows are tenant overrides or
validated custom targets.

This was chosen over seeding every tenant because it:

- gives existing and new tenants working defaults immediately;
- avoids destructive or drifting copies of product-owned defaults;
- lets a tenant disable or customize a built-in by storing an override;
- makes deleting a built-in override a safe “restore default” operation.

Built-in targets:

| Key | Kind | Destination | Conversion |
| --- | --- | --- | --- |
| `home` | route | `/home` | no |
| `products` | route | `/products` | no |
| `inventory` | route | `/vehicles` | no |
| `vehicle-detail` | route | `/vehicles/:vehicleId` | no |
| `showcase` | route | `/showcase` | no |
| `account` | route | `/account` | no |
| `contact-lead-form` | form | `/contact#concierge-lead-form` | yes |
| `vehicle-inquiry` | modal | `/vehicles/:vehicleId#vehicle-inquiry` | yes |

## Prompt and action safety

Only enabled targets enter the system prompt. Tenant-authored labels,
descriptions, and examples are serialized as bounded JSON and treated explicitly
as untrusted data. Angle brackets are escaped so content cannot close the prompt
delimiter.

The model emits only a key and string parameters. Before an action reaches the
browser, the server:

1. checks persona capability gates;
2. verifies that the key exists and is enabled for this tenant;
3. replaces any model-authored descriptor or attribution with trusted data;
4. rejects vehicle-detail navigation unless the exact vehicle ID was grounded
   by this turn’s tenant inventory or a trusted vehicle tool;
5. permits direct lead capture only when its email or phone appeared in a real
   visitor message, and strips model-invented name/message fields;
6. deduplicates equivalent legacy and registry actions;
7. attaches a bounded session and recent-conversation attribution excerpt.

The browser accepts a `navigate-target` only when it includes the trusted server
descriptor and the destination passes the shared public-path validator again.
Route parameters are URL-encoded. `/admin`, `/api`, external URLs, query strings,
path traversal, arbitrary selectors, and arbitrary scripts are rejected.

For “this car” follow-ups, the server prefers the current public VDP, then the
latest trusted `get_vehicle_details` memory result. Legacy browser history may
also contain a vehicle ID inside leaked provider control syntax; that value is
only an untrusted candidate. Every source requires an exact
`tenant_id + live status + UUID` lookup before it can ground an action, so a
forged or cross-tenant value cannot navigate.

High-confidence explicit requests such as “take me to the products page,”
“open the contact page,” and “take me to that vehicle” are also resolved
deterministically against the enabled registry. Brand inventory questions such
as “do you have any BMWs?” deterministically emit the same canonical make
filter used to ground the answer, so cross-route navigation cannot lose the
filter while the inventory screen mounts.

Make detection uses the shared vehicle alias dictionary, including common
short forms and plurals. The chat route resolves the result against the
tenant's bounded facets vocabulary, so a visitor saying “Mercedes” produces
the exact stored/public filter `Mercedes-Benz` rather than a near-match that
returns zero.

Inventory grounding is server-filtered. The chat route does not download the
tenant's full vehicle table and attempt to match it in memory; that approach is
both expensive and incomplete once PostgREST's response row cap is reached.
It loads the bounded facet vocabulary, then runs a tenant- and live-status
scoped vehicle query with an exact count. The same parsed filters are merged
into any model-requested vehicle tool query, preventing a tool from dropping
or abbreviating the visitor's make. A verified zero is explicitly included in
the model context; database failures surface as errors and are never presented
as “no vehicles.”

An explicitly named vehicle is resolved only from that turn’s tenant-scoped
live matches. Year, price, and mileage anchors must match exactly; make and
model/trim tokens must also be present, and equal-scoring matches fail closed.
This lets an exact listing open reliably without trusting the model to copy an
ID, while ambiguous requests remain on the current page. These fallbacks only
emit UI actions; they cannot submit a lead or mutate data.

## Streaming reliability

`InlineActionStreamFilter` in `apps/admin/lib/botActions.ts` is line-aware:

- normal prose passes through as soon as it is known to be prose;
- a candidate beginning at any `{` is held across arbitrary model chunks, even
  when a provider puts it after prose instead of on a clean line;
- a valid action line becomes only a structured SSE action;
- provider-authored `json` protocol fences are suppressed with their action so
  an extracted payload cannot leave an empty code block in visitor-visible
  prose;
- malformed or ordinary JSON remains visible instead of being silently deleted;
- only visible prose is persisted to visitor preference memory or conversation
  memory.

The non-streamed path uses the matching `stripInlineActions()` behavior.
When a response contains a valid action but no visitor-visible prose, the
server supplies a short deterministic acknowledgement instead of rendering an
empty assistant turn.
DeepSeek DSML receives the same treatment: it is removed from complete and
streamed output. Only bounded function calls whose names were already exposed
by the tenant's callable-tool allowlist can be recovered; their arguments still
pass through the normal schema and tenant-scoped executor. Unknown or
mutation-like DSML is discarded.

## Client execution

`src/lib/conciergeTargetRuntime.ts` resolves the trusted descriptor and stores a
pending action in session storage plus an in-memory fallback.

- Route targets navigate immediately.
- Cross-route form/modal targets navigate first and remain pending.
- `useConciergeTarget(handlerId, handler)` activates them when the destination
  component mounts.
- DOM anchors use an allowlisted ID, smooth scrolling, reduced-motion support,
  and form focus.

The app-level consumer is always mounted in `src/App.tsx`, so actions do not
depend on the chat’s current page.

Existing surfaces are wired as follows:

- inventory: generic route target;
- vehicle detail: parameterized generic route plus legacy
  `highlight-vehicle` compatibility;
- general contact: shared `ConciergeLeadForm`, used by both the handcrafted and
  published Page Builder contact renderers;
- vehicle inquiry: registered VDP modal handler.

## Wiring a new website surface

### Route

1. Ensure the public React Router route exists.
2. Add a target in Admin, for example key `trade-in`, kind `route`,
   destination `/trade-in`.
3. Describe when it should be used and enable it.

No client action code is required.

### Section or form

1. Give the element a safe ID:

   ```tsx
   <section id="finance-calculator">…</section>
   ```

2. Add a target with destination `/finance#finance-calculator`.
3. Use kind `section-anchor` or `form`; forms receive focus after scrolling.

For custom behavior, register once:

```tsx
useConciergeTarget("finance-calculator", (action) => {
  openCalculator(action.params);
});
```

### Modal

Register the modal handler once and use `/route#handler-id` as the destination:

```tsx
useConciergeTarget("trade-in-modal", () => setOpen(true));
```

Adding more registry entries that use the same registered surface needs no code.

## Leads and conversion attribution

`capture_lead` submits directly through the existing tenant-scoped
`POST /api/leads` path. Form targets open a real form; they do not create a lead
until the visitor supplies a reachable email or phone and submits.

For concierge-driven submissions, the allowlisted `leads.source_context` stores:

- action type;
- target key;
- vehicle ID, when applicable;
- opaque chat session ID;
- a bounded recent conversation excerpt.

The operational `inquiry_submitted` conversion event and loyalty metadata also
record `conciergeDriven`, action, target key, and session ID. Arbitrary event
metadata from the model or browser is discarded.

### ADF/XML seam

ADF delivery remains future work. The clean seam is after `/api/leads` creates a
validated tenant-scoped lead. The existing `enqueueLeadCreatedWebhooks()` call
already provides asynchronous delivery isolation. A future dealer-CRM adapter
should read the stored lead and source context server-side, generate ADF/XML,
and enqueue/retry it through that delivery layer. It must not generate ADF in
the browser or trust action payload XML.

## Admin behavior

Admin → AI Concierge → Targets supports:

- effective built-in and custom target list;
- enable/disable;
- label, kind, destination, AI description, examples, and conversion editing;
- safe custom target creation;
- restoring a built-in override;
- deleting a custom target;
- explicit loading, success, migration-warning, and authorization states.

The chat safely falls back to built-in targets if migration 073 has not yet been
applied. Admin writes remain disabled in that state.

## Release checklist

1. Review and merge the code into the release branch.
2. Confirm the target database is at migration 072.
3. Apply `073_concierge_targets.sql` to staging only.
4. Verify:
   - table exists;
   - RLS is enabled;
   - exactly the member-select policy exists;
   - authenticated has `SELECT` only;
   - service role has write privileges;
   - index and updated-at trigger exist.
5. Run Supabase security/performance advisors and investigate any finding that
   references `concierge_targets`.
6. Deploy the public and Admin applications to staging.
7. Exercise inventory, exact VDP navigation, contact form, vehicle inquiry,
   disabled target, custom target, and cross-tenant checks.
8. Apply to production only through the separately approved release process,
   before or atomically with the compatible application deploy.

Rollback is application-safe: the code falls back to source-controlled targets
when the table is unavailable. Do not drop the table during an incident; roll
back application code first and retain tenant configuration for a later retry.

## Deliberately deferred

- Dealer-specific ADF/XML formatting and delivery credentials.
- Arbitrary client selectors, CSS, JavaScript, external URLs, or raw HTML.
- Automatic discovery of DOM elements.
- Multi-step transactional workflows such as finance calculation or appointment
  booking; those can register targets now and add their domain workflow later.
- A target marketplace or cross-tenant target sharing.
