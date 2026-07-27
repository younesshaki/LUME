# LUME Concierge Operator — Accuracy-First Blueprint

**Status:** active architecture and delivery plan. The first authenticated
read/navigation slice and a first reviewed write capability are implemented in
this worktree; the write remains inactive until its migration is explicitly
approved and applied.

## Decision in one sentence

Build the admin concierge as a **permissioned command system**, not a model that
clicks around the dashboard: an LLM may translate a tenant user's words into a
typed plan, but deterministic LUME code must resolve resources, authorize every
step, show the exact impact, execute only confirmed operations, and verify the
result from the source of truth.

This is the only credible route to the requested standard of accuracy and
reliability. A stronger model can improve understanding; it cannot make an
unbounded browser agent safe, tenant-isolated, or auditable.

## Current-state audit

### What LUME already has

The public concierge has unusually strong foundations:

- `apps/admin/app/api/chat/route.ts` is tenant-scoped, rate-limited, plan-gated
  and deterministic-first.
- `apps/admin/lib/chatConversationState.ts` keeps explicit inventory state:
  active filters, the ordered verified result set, and the selected vehicle.
  Ordinal actions are grounded against that exact set rather than a new model
  search.
- `packages/bot` exposes typed inventory tools; `packages/rag` provides filter
  extraction and trusted query construction.
- The route filters model actions after tool execution. A model suggestion is
  not itself authority to navigate, filter, compare or collect a lead.
- Conversation drift work is covered by unit tests and live scenario scripts,
  while opt-in debug transcripts make incidents reproducible.

The Website Studio already proves the right safety pattern for one narrow admin
domain:

- `apps/admin/app/api/editor/chat/route.ts` authenticates the caller and
  requires owner/admin/editor role.
- `apps/admin/lib/editorCopilot.ts` accepts a closed union of four proposed
  page-block edits, validates each against live block descriptors, and applies
  nothing until the human clicks **Apply**.
- The editor's model call is isolated in `editorCopilotLlm.ts`; malformed model
  output falls back to prose instead of a mutation.

The dashboard also already provides useful building blocks: Supabase auth and
tenant role checks, server actions, tenant-scoped queries, an audit log helper,
design/page drafts and previews, confirmation dialogs, managed feed queues, and
a broad set of domain-specific actions.

### What is missing

There is no authoritative, shared **admin capability registry**. Dashboard
operations currently live as many independent server actions, for example:

- website/page/design changes;
- vehicle changes, bulk status and pricing updates, image imports, imports;
- lead status and assignment;
- concierge persona and target configuration;
- domains, team, loyalty, API keys, integrations, billing, and inventory feeds.

Those actions are good UI endpoints, but an LLM cannot safely discover or call
them as an open-ended API. Their inputs, role requirements, destructive effects,
confirmation requirements, audit semantics, and verification reads are not yet
declared in one machine-checkable place.

This means the existing editor copilot should be **preserved and generalized**,
not replaced. It is not yet a dashboard operator.

## Product boundary

There should be two explicit products sharing core infrastructure, not one
omnipotent assistant.

| Surface | User | Primary job | Default behavior |
| --- | --- | --- | --- |
| Public concierge | Site visitor | Discover, filter, compare, navigate, begin a lead | Deterministic inventory facts/actions; model only for grounded explanation |
| Admin concierge | Tenant team member | Find information, navigate the admin, prepare and operate permitted work | Plan first; preview and confirm writes; verify every mutation |
| Editor concierge | Tenant editor | Propose website-page block changes | Keep the current draft-only Apply/Discard workflow |

The admin concierge must never inherit a public visitor's conversation, tools,
or permissions. Its memory namespace is `(tenant_id, authenticated user_id,
admin session_id)` and it must be deleted/expired independently.

## Reliability contract

Every admin turn must end in exactly one of these states:

1. **Answered from verified data** — cites the source records/timestamp.
2. **Navigated** — opens a known dashboard route; no side effect.
3. **Needs clarification** — names the missing or ambiguous choice.
4. **Proposed** — presents a validated, human-readable plan and impact.
5. **Executed and verified** — includes a command receipt and a fresh read of
   the affected resource.
6. **Refused safely** — explains that permission, tenant isolation, policy, or
   available capabilities prevent the action.

It must never say that a write happened when it has only prepared a plan, and
must never claim a fact, action, record count or status that was not read from
LUME's source of truth during the turn.

Confirmed write plans also use a compare-and-swap precondition: the record's
reviewed state is rechecked under the same database lock used for execution.
If a teammate changed it after preview, the command becomes terminally stale
and makes no write; the operator must refresh and review a new exact diff.
The executor also locks and rechecks the actor's current editor-level tenant
membership inside that transaction, closing the small window between an API
role check and a concurrent access revocation.

## The core design

```text
Tenant user
   │ natural-language request
   ▼
Admin concierge UI ── current route + selected records (untrusted context)
   ▼
Intent / plan compiler (LLM, structured output only)
   ▼
Deterministic capability registry
   ├─ validate schema and known resource references
   ├─ re-resolve all records tenant-scoped
   ├─ check authenticated role + plan + policy
   ├─ compute impact / diff / risk
   └─ decide: answer, navigate, clarify, preview, or execute
   ▼
Confirmation gate for writes
   ▼
Capability executor (one domain service per command)
   ▼
Fresh verification read + audit receipt + telemetry
   ▼
Tenant user
```

### 1. Capability registry

Create a server-only registry such as `apps/admin/lib/adminConcierge/registry.ts`.
It is the allowlist of everything the assistant can do. Each capability has:

```ts
type AdminCapability<I, Preview, Result> = {
  id: "vehicle.bulk_price_update";
  title: string;
  inputSchema: ZodSchema<I>;
  minRole: "viewer" | "editor" | "admin" | "owner";
  effect: "read" | "navigate" | "draft" | "write" | "destructive" | "sensitive";
  confirmation: "none" | "standard" | "typed";
  resolve(input, actor): Promise<Resolved<I>>; // tenant-scoped, canonical IDs
  preview(resolved, actor): Promise<Preview>;  // exact count/diff/side effects
  execute(resolved, actor, idempotencyKey): Promise<Result>;
  verify(result, actor): Promise<VerifiedReceipt>;
};
```

The model sees only a compact, readable capability catalog. It returns a closed
structured `CommandPlan` that names capabilities and typed arguments. It cannot
send SQL, arbitrary URLs, arbitrary server-action names, JavaScript, or a raw
Supabase filter.

The authenticated member's actual `tenant_members.role` is checked against the
registry's declared minimum role before the route dispatches any plan. This is
central policy enforcement, not a convention inside individual capabilities;
model-planned and deterministic intents take the exact same gate.

When a navigation request names a category rather than a specific registered
surface (for example, “open settings”), deterministic code returns a bounded,
server-authored clarifying question. It does not let a model silently choose a
plausible settings page.

Navigation aliases are matched as whole phrases and resolved by deterministic
specificity. A named surface such as “inventory feeds” wins over the generic
“inventory” surface; equal-strength matches stay ambiguous rather than sending
the operator to a plausible but wrong screen.

The dashboard client may supply its current route solely as display context.
Before reflecting it back (for example, “where am I?”), the server binds it to
the authenticated tenant prefix and resolves it through the capability registry.
External, cross-tenant, and unknown paths yield no claimed page context.

Result rows are also not direct client-built detail URLs. Selecting one sends a
bounded ordinal through the same server-owned result-set resolver used for
natural-language “open the second one”; the server verifies current tenancy and
record existence before issuing any navigation action.
Clarification candidates are deliberately non-selectable: only a response that
persisted a fresh verified result set may offer an item-level open action.

Existing server actions should be refactored gradually so both the existing UI
and the concierge call the same **domain services**. Do not have the concierge
call a client-side server action directly. This removes divergent authorization
and business logic.

### 2. Resource grounding

Names are never IDs. For "mark the two oldest BMWs sold," the planner returns
an intent, then deterministic code queries the tenant catalog and produces the
specific IDs, ordered results and the exact count. If more than one interpretation
is credible, it asks a precise clarifying question. It never chooses silently.

Use state objects tailored to admin work, rather than copying public inventory
state blindly:

```ts
type AdminConversationState = {
  currentRoute: string | null;
  activeScope: { kind: "vehicles" | "leads" | "pages" | "feeds" | null; ids: string[] };
  lastResultSet: { capabilityId: string; orderedIds: string[]; total: number; createdAt: number } | null;
  pendingPlan: { id: string; contentHash: string; expiresAt: string } | null;
};
```

`pendingPlan` is one-time and short-lived. The execute request includes its
opaque server-issued ID and a fresh CSRF/session check. The client cannot alter
the plan after preview.

### 3. Safety tiers

| Tier | Examples | Execution |
| --- | --- | --- |
| Read / navigation | "show failed feed runs", "open the Camry", "take me to Leads" | Immediate after authorization |
| Reversible draft | page/design edit, create unpublished page, compose an outbound export draft | Preview; Apply/Discard |
| Bounded write | update one vehicle field, assign a lead, enable an existing feed | Exact diff + standard confirmation |
| Broad or external write | bulk pricing, publish design, run a feed/export, create webhook | Exact impact + typed confirmation; idempotency key |
| Destructive / credential / billing / access | delete inventory, revoke API key, delete domain/feed, change plan, invite/remove users | Do not offer in v1, or owner-only typed confirmation with a separate existing UI review |

For initial launch, exclude credentials, API keys, billing, domains, role
changes, deletes, and bulk vehicle deletion from the registry entirely. The
concierge may navigate to their screens and explain the next step, but cannot
perform them. That boundary is product quality, not a missing feature.

### 4. Verification and idempotency

Every mutation receives an idempotency key derived server-side from the pending
plan and actor. The executor records the plan, action, actor, canonical target
IDs, before/after summary, and result into the existing audit pipeline plus a
new command receipt store when persistent replay is needed.

After execution it must issue a tenant-scoped fresh read. A write succeeds only
when that read proves the requested state. Otherwise it reports a partial or
failed operation exactly, without optimistic prose.

Long-running operations (feed runs, exports, large imports) are requests to
existing queues, not synchronous agent loops. The receipt links to the existing
run/delivery record and reports queue state; completion is confirmed only by the
worker's terminal status.

### 5. Model role and routing

Use a model for language understanding, concise explanation and structured plan
generation—never as a verifier of its own work. The verifier is deterministic
code plus source-of-truth reads.

Route calls through one provider abstraction / gateway rather than hardwiring a
different implementation for GPT, Claude and Kimi. The current LUME
`chatProvider` abstraction is a transition layer; a production upgrade should
provide:

- named model tiers (fast extraction, frontier plan generation);
- feature, tenant and environment tags;
- provider/model fallback for availability, never fallback that weakens a
  command schema or confirmation policy;
- per-tenant/user budgets and rate limits;
- captured model/provider metadata in each command trace.

Vercel AI Gateway supports a unified provider interface, model and provider
fallbacks, spend/latency observability, and per-request attribution, which is a
good operational fit if LUME remains on Vercel. See the [official gateway
overview](https://vercel.com/docs/ai-gateway) and [fallback
documentation](https://vercel.com/docs/ai-gateway/models-and-providers/model-fallbacks).
Before choosing concrete IDs, query the gateway's live model list and run LUME's
own evaluations; model quality and identifiers change too quickly to encode a
permanent opinion in this document.

### Gateway integration now in the worktree

The existing provider seam now also supports Vercel AI Gateway with two
tenant-selectable premium profiles: `openai/gpt-5.4-mini` and
`anthropic/claude-sonnet-4.6`. These identifiers were checked against the
[AI SDK provider/model documentation](https://ai-sdk.dev/docs/foundations/providers-and-models)
on 2026-07-27. They are deliberately stored as LUME profile IDs and mapped to
their gateway IDs on the server, so a browser or tenant database row cannot
choose an arbitrary upstream provider/model.

Configuration is server-only through `AI_GATEWAY_API_KEY` (or a deployment
equivalent configured in Vercel); the client receives only a boolean
availability state. The direct DeepSeek/Moonshot adapters remain available for
backward compatibility. When a selected provider is unavailable, LUME falls
back to a configured allowlisted profile and records the requested/effective
profile metadata in bounded server telemetry. A model failure still fails
closed: it yields no executable command.

Gateway is a model transport and availability layer, not a safety verifier:
every gateway response is parsed as the same closed intent union, then passed
through resource grounding, role checks, confirmation, idempotency and fresh
verification reads.

Recommended starting experiment:

- Fast path: deterministic parser/router first; a low-cost structured-output
  model only for ambiguous language.
- High-stakes or multi-step plan: one frontier model for plan generation.
- No "second model catches mistakes" in the execution path. A second model can
  be valuable offline for labeling/evaluation or as an optional *non-authoritative*
  critique, but it must not become the thing that decides whether a real write
  is safe.

## What machine learning should—and should not—do

Do **not** train a custom model before LUME has a substantial, consented,
properly labeled corpus of concierge interactions and outcomes. Fine-tuning now
would make behavior harder to inspect while solving the wrong problem.

Use learning later for narrow, measurable tasks:

- intent/capability ranking from anonymized, reviewed requests;
- entity-resolution candidates (never final IDs);
- routing a request to deterministic / fast-model / frontier-model tiers;
- detecting likely ambiguity or high-risk requests;
- offline regression generation and failure clustering.

The production authority remains the capability registry, policy engine and
verification reads. Success is measured by grounded-command correctness, not
by a model's confidence score.

## Evaluation is a product feature

Create versioned eval fixtures before broad admin actions ship. Each case has:

- a tenant fixture and actor role;
- initial resource state;
- natural-language request and any multi-turn history;
- expected classification/clarification or canonical command plan;
- expected preview, confirmation requirement, execution receipt and final
  verified state;
- explicit assertions that cross-tenant IDs, unauthorized actions and unknown
  fields are rejected.

Measure separately:

1. **Intent validity:** a plan contains only allowed capability IDs and valid
   inputs.
2. **Grounding accuracy:** chosen IDs and counts match source-of-truth queries.
3. **Authorization correctness:** every role/tenant boundary fails closed.
4. **Execution correctness:** final verified state matches the confirmed diff.
5. **Honesty:** no false completion claim; no empty response.
6. **Recovery:** ambiguous, stale, changed or failed work results in a useful
   clarifier or receipt, not a guessed retry.

Release gates should be stricter than ordinary UI tests:

- 100% pass for authorization, tenant isolation, destructive-action refusal,
  idempotency and verified-receipt cases;
- 100% pass for existing public concierge regression suites;
- an explicit target for allowed admin command grounding (initially 100% on the
  launch capability catalog, with no automatic execution for unsupported forms);
- shadow mode before writes: generate, validate and log plans while humans use
  the normal UI, then compare proposed impact to the completed UI action.

## Delivery sequence

### Progress — 2026-07-27

Phase 0/1 has begun in this worktree with a deliberately narrow, shippable
control-plane slice:

- `apps/admin/lib/adminConcierge.ts` contains a closed capability registry and
  validates model plans against it.
- `POST /api/admin/concierge` authenticates the caller, performs a tenant role
  check, re-resolves data with tenant-scoped reads, and returns only a
  server-issued internal navigation action or reviewed-command preview. It has
  no executable write path until migration 080 is explicitly applied.
- The authenticated admin shell exposes an **Ask LUME** panel. It can navigate
  across every current dashboard area, run fresh vehicle/lead searches, and
  inspect recent managed-feed health from the tenant-scoped run ledger.
- Its browser session carries only a server-owned, 15-minute verified result
  set. “Show me” and “open the first/second one” resolve strictly against that
  exact ordered set after a fresh tenant-scoped existence check; they never
  rerun a broad query or let a model choose a record. State is keyed by tenant,
  authenticated actor, and browser session, distinct from public chat.
- Admin inventory requests use the same trusted LUME filter extraction as the
  public concierge. Price, year and mileage constraints are applied to the
  tenant-scoped query and encoded into the issued Vehicles URL, so “BMWs
  between $40k and $55k” cannot return one count and open a differently scoped
  inventory page.
- Common unambiguous wording is parsed deterministically. Unsupported wording
  may use the existing configured model only to select a closed read-only plan;
  model prose is ignored and the model receives no tenant data.
- With `LUME_CHAT_DEBUG=1`, the route logs a bounded command trace: tenant and
  actor IDs, deterministic/model source, whether a model was attempted, and
  the safe intent metadata. It deliberately omits raw message text, raw model
  output, lead data, credentials, and model reasoning.
- `apps/admin/lib/adminConciergeEval.ts` adds a versioned, provider-independent
  regression corpus for navigation, searches, the reviewed lead write, and
  hostile/invented model plans. CI proves the closed-plan contract without
  requiring a live model or tenant data.
- The admin planner now honors the tenant's configured model tier with the
  existing premium-entitlement clamp. It records only requested/effective
  model IDs and fallback state in debug telemetry—never prompts, completion
  text, chain of thought or secrets.

This is intentionally not marketed as a general autonomous operator yet. It is
the safety substrate for it. No database migration or production data mutation
was required for this milestone.

### Progress — initial bounded commands (unapplied migration)

Two confirmed capabilities have been implemented but remain inactive until
explicit approval to apply `080_admin_concierge_commands.sql` to a named
environment:

1. **One named lead status change** to `new`, `contacted`, `qualified`, or
   `won`. Resolve the named lead inside the tenant; ambiguity requires a more specific
   name/email.
2. **One named managed-feed run**. Resolve only an enabled source by name and
   preserve its reviewed configuration version; the command queues the existing
   durable worker run and never performs a synchronous fetch/sync.
3. Persist a five-minute reviewed command and render its exact before/after
   status.
4. Require an explicit **Confirm change** click.
5. Execute through one locked, service-only database transaction with a unique
   idempotency receipt.
6. Re-read the lead or queued run through the authenticated tenant client before
   saying it succeeded, record the appropriate audit event, and for leads add a
   lead activity.

No deletes, loss reasons, credentials, billing, roles, domains, API keys, bulk
operations, or arbitrary URLs are included. Before migration 080 is applied,
the API returns a clear migration-required response and performs no write.

### Phase 0 — establish the control plane (first)

1. Document every dashboard action, its domain owner, role policy, side effects,
   audit coverage and whether it has a verification read.
2. Extract shared domain services from the first selected server actions; retain
   current UI behavior and tests.
3. Build the server-only capability types, registry, policy evaluator,
   resource resolvers and command receipt/audit format.
4. Add an admin-concierge trace schema and an eval harness. Redact secrets,
   lead PII and credential values by default.

**Exit gate:** a simulated command can be parsed, rejected/clarified, previewed
and verified without any model or UI mutation.

### Phase 1 — read, navigation and deterministic admin search

Ship only read/navigation capabilities:

- find/open vehicles, pages, leads, customers and feed runs;
- summarize real dashboard metrics and current configuration;
- navigate to a known admin route with grounded IDs;
- explain a failed feed/run from its actual error record.

**Exit gate:** no write capabilities exist; all returned facts include a source
record/time and pass multi-tenant, role and long-conversation tests.

### Phase 2 — expand the existing editor concierge

Move page editing to the shared registry but preserve the current local draft,
Apply/Discard and undo model. Add predictable commands for page creation,
block edits, navigation configuration and design drafts. Publishing remains a
separate typed confirmation.

**Exit gate:** page-preview parity and existing editor tests remain green;
the concierge cannot save or publish without an explicit reviewed action.

### Phase 3 — bounded operational writes

Introduce a small, high-value set:

- assign/update a lead;
- update one vehicle's non-sensitive field;
- propose a bounded bulk price/status operation with an exact selected list;
- enable/disable an existing managed feed or enqueue a run.

All use preview → confirm → idempotent execute → fresh verification read.

**Exit gate:** recorded receipts, audits, retries and intentionally interrupted
commands are proven correct in integration tests.

### Phase 4 — supervised operations and analytics

Support queue-backed imports/exports, launch-readiness remediation proposals,
and operational summaries. Make no autonomous recurring changes. Scheduled or
bulk work must show scope, owners and cancellation path in the existing UI.

### Phase 5 — controlled autonomy, only after evidence

Consider optional rules such as "run this named feed every morning" only after
the corresponding manual command has an excellent audited history. Rules must
be tenant-owned, narrowly typed, opt-in, visible, revocable, rate-limited and
never cover destructive, billing, access, or credential actions.

## The public concierge improvement path

The public concierge should continue its deterministic-first trajectory rather
than be replaced by an admin-agent architecture. Priorities are:

1. Keep extending state-machine regression coverage from real transcripts.
2. Convert frequent deterministic answer shapes into source-grounded templates.
3. Make action/state traces visible to authorized tenant staff in a privacy-safe
   conversation review screen.
4. Add an offline eval corpus: inventory facts, filters, refinements, resets,
   ordinals, comparisons, lead actions, failures and adversarial prompts.
5. Only use an LLM for unsupported phrasing, grounded prose and plan extraction;
   all facts/actions remain post-validated.

## Initial admin concierge prompts that should become supported

- "Show every lead waiting more than a day and open the highest-value one."
- "Which feed failed most recently, and why?"
- "Find the 2026 Camry and update its public description to this text." (preview)
- "Draft a more minimal hero section for the Inventory page." (editor proposal)
- "Show me every vehicle without a complete image gallery."
- "Prepare a 5% price reduction for these three specific vehicles." (exact
  impact + confirmation; never broad implicit selection)
- "Assign the new Ferrari inquiry to Sarah." (ground Sarah and the lead,
  confirm if ambiguity exists)

## Non-negotiable anti-patterns

- No browser/DOM automation as the source of authority.
- No raw database or SQL tool for the model.
- No model-created URLs, resource IDs, tenant IDs, role changes or credentials.
- No execute-on-parse; all side effects go through capability policy.
- No confirmation based only on natural-language "yes" when more than one
  pending plan exists or the plan has changed.
- No model-only truth checking; use a fresh LUME read.
- No training on tenant/visitor content without an explicit retention, consent,
  redaction and deletion policy.

## Recommendation

The opportunity is real and differentiating: a trustworthy concierge that can
operate a dealership's digital showroom is materially more valuable than a
generic dashboard chatbot. But sell and build it as **"tell LUME what outcome
you want; it prepares a verified operation and executes only what you approve"**,
not as autonomous dashboard browsing.

Start with Phase 0 and Phase 1. They create the safety substrate and provide a
useful admin experience quickly. Do not start with broad writes or ML.
