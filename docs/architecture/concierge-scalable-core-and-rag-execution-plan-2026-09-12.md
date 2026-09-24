# LUME Concierge: Scalable Core and RAG Execution Plan

- **Date:** 2026-09-12
- **Status:** Phases 1-4 implemented in code; Phase 3 activation and Phase 4 migration/live benchmark remain gated; Phases 5-6 not started
- **Audience:** product owner and Claude, as reviewer and subsequent implementing agent
- **Scope:** public website concierge and authenticated dashboard concierge

## 1. Executive decision

Build on LUME's existing deterministic safeguards, capability registry, conversation memory, provider adapters, and tenant-scoped data access. Do not replace them with an unconstrained agent or a new parallel framework.

The target architecture is:

> Flexible language interpretation → validated typed plan → deterministic state transition → authoritative retrieval or query → controlled execution → grounded response and verified UI outcome.

Use models to understand language and explain evidence. Use application code to enforce permissions, constraints, identities, ordering, confirmations, and business rules. Use document RAG for unstructured knowledge; use structured database queries for inventory, leads, counts, prices, availability, and operational state.

The desired outcome is higher successful-task accuracy at a measured latency and cost—not a more elaborate prompt, a larger default model, or a high self-reported confidence percentage.

### Product decision log — 2026-09-12

**Decision:** Keep the public concierge on its current tenant-scoped keyword and fuzzy document retrieval for now. Do not activate semantic retrieval, add an external embedding provider, or make a schema change as part of the current concierge-hardening work.

**Reason:** The current seeded corpus is small and dealer-facing knowledge authoring/publishing does not yet exist. Improving state correctness, language interpretation, observability, and secure knowledge lifecycle has higher product value than tuning vector retrieval over static seed content.

**Deferred future capability:** After secure knowledge authoring and publication exist, benchmark two compatible semantic-retrieval options against a held-out LUME knowledge set:

1. **Cohere Embed v4** for managed multilingual embeddings, subject to explicit approval of provider data-processing terms, a tenant/global spend cap, an additive vector-dimension migration, re-embedding, and no private customer/lead/credit/credential content.
2. **Locally hosted multilingual E5 through Ollama** as a no-per-token-cost comparison baseline. It matches the current 768-dimensional schema, but is only production-suitable after LUME deliberately operates reliable, private, monitored embedding infrastructure; a developer Mac is not a production service.

The benchmark—not provider marketing or a single demo—selects the production path. Do not mix vector generations from different embedding models in the same active retrieval index.

### Review instructions for Claude

1. Read this document and reconcile every current-state assertion against the checkout.
2. Produce a review identifying accepted decisions, risks, stale claims, missing work, and proposed amendments.
3. Distinguish work already implemented from actual gaps. Do not rebuild completed capabilities.
4. Present the review before implementation. This document alone does not authorize execution; if the owner explicitly authorizes review-and-execute together, proceed after recording the review and resolving blocking choices.
5. Once execution is authorized, implement in the phased order below. Keep small, independently reviewable commits on a feature branch.
6. Migration application, production writes, new paid services, and deployment remain separate approvals even when code implementation is authorized.

## 1b. Implementation status — 2026-09-12

Phases 1 and 2 are implemented on branch `feat/concierge-core-hardening`
(commits `072bd63`, `db0dc11`, `f4a0d62`, `8a3e909`, `682a664`, `2abec20`).
This historical checkpoint covered Phases 1-2 only. See the dated Phase 3 and
Phase 4 sections below for the work subsequently added on the integration
branch. No migration or production mutation has been performed.

### Section 3.3 findings, as verified against the checkout

All twelve were **confirmed**. The line anchors in §3.2 were accurate to within
a line or two. Evidence is recorded in the review that preceded implementation;
the load-bearing ones:

| #   | Finding                                                                        | Evidence                             | Status now                                   |
| --- | ------------------------------------------------------------------------------ | ------------------------------------ | -------------------------------------------- |
| 1   | Public route uses `retrieveByKeywords`                                         | `route.ts:54,451`                    | Unchanged (still keyword-only; RAG deferred) |
| 2   | Unpaginated `rag_chunks` read each turn                                        | `route.ts:417-420`                   | **Fixed**: deferred to the model path        |
| 4   | Context loaded before it is known to be needed                                 | one unconditional `Promise.all`      | **Fixed**                                    |
| 7   | Admin planner gets the message with no task context; `clarify` → `unsupported` | `route.ts:271-303`                   | **Fixed**                                    |
| 9   | `recordModelUsage` has no tokens/latency/cost                                  | `observability.ts:253-281`           | **Fixed**: `recordConciergeTurn`             |
| 10  | Memory append is an unguarded read-modify-write                                | `conversationMemory.server.ts:33-37` | **Fixed**: compare-and-set                   |
| 11  | Rate limiting is instance-local                                                | `rateLimit.ts:1-9`                   | Unchanged (deferred with Phase 5)            |
| 12  | Vectors are 768-dim                                                            | `011:129`                            | Unchanged (RAG deferred)                     |

### Corrections to this plan's assumptions

Recorded so the next agent does not re-derive them:

1. **§6.2 is greenfield, not an extension.** The knowledge admin is read +
   delete only (`KnowledgeClient.tsx` has one mutation, `deleteDocument`).
   There is no upload, create, edit, chunker or embedding trigger anywhere in
   the app. The only writer is `scripts/seed-default-tenant.ts`, offline.
2. **The corpus is 19 chunks** from a static `embeddings.json`, and cannot
   grow through the product. Hybrid retrieval, RRF tuning and recall@8 targets
   are machinery for a corpus that currently has no authoring path. Sequence
   Phase 4a (authoring) before 4b (retrieval).
3. **No embedder is configured.** The only implementation is Ollama pointed at
   a LAN address; `apps/admin/.env.local` carries no embedding provider. The
   provider decision in §12.3 is a Phase 4 _blocker_, not a deferral.
4. **`retrieveContext` and `match_rag_chunks_for_tenant` are dead code** — not
   called anywhere in app code. The RPC exists but has never run in production.
5. **`rag_chunks` is anon-readable table-wide** for any active tenant
   (migration `017`), with no publication or visibility column to filter on.
   Any visibility metadata is unenforceable until that policy is rewritten, and
   this is the concrete reason §12.5 (private tenant documents) must stay at
   its safe default of excluded. Note `rag_documents` is member-only
   (`011:185`) while `rag_chunks` is not.
6. **No FTS exists on `rag_chunks`.** §6.4's lexical half needs a `tsvector`
   column and GIN index — a new migration. Precedent: `015_vehicle_fts.sql`.
7. **The seed script is destructive** (`seed-default-tenant.ts:195` deletes all
   tenant chunks before inserting), contradicting §6.2's "no destructive
   re-seeding". That is a change to make, not a policy to assert.
8. **§4.3 conflicts with a deliberate fix.** `preserveResultSetForZeroResults`
   intentionally rolls filters back and retains the prior result set to prevent
   the 2026-07-22 compounding bug. The attempted-zero separation was
   implemented _on top of_ that rollback, not instead of it.

### Follow-up — lifecycle wiring (same branch)

The first pass added the mechanisms; this one puts them on the live path.

- **CAS is now used, not merely available.** The route reads `stateVersion` at
  turn start and commits against it through one writer shared by all three
  response paths. A lost race is recorded as `api/chat/memory-conflict` and the
  turn's write is dropped, so the newer turn's state stands. Previously the
  guard existed but nothing passed `expectedStateVersion`, so a late turn could
  still overwrite a newer one.
- **Reference actions are blocked while the shared store is degraded.** An
  ordinal, a selection, a positional comparison and a stored-result "show me"
  all resolve against a list this process believes it showed; during an outage
  another instance may have served that turn. All four now refuse and explain,
  and the reference ids are cleared so the refusal is not contradicted by a
  navigation action built from them. Stateless questions still work. This only
  fires when a CONFIGURED shared store fails — a deployment without one never
  promised cross-instance continuity and is unaffected.
- **Multi-call usage is labelled.** The tool path makes two upstream calls and
  only the first reports tokens. The record now carries `usage.coversCalls`
  and `usage.partial`, reports the source as `provider_partial`, and marks any
  derived cost `priced_partial` so it cannot be summed as a complete bill.

### Follow-up — turn sequencing and retry idempotency (same branch)

**The contract.** Each public turn carries an opaque UUID generated by the
browser immediately before the request, sent in the JSON body as `requestId`,
echoed back in the SSE `meta` event. It is namespaced by the conversation key
and grants nothing on its own. The server validates the exact UUID shape and
falls back to its own id when a caller omits or malforms one, so non-browser
callers are unaffected.

It does two jobs:

1. **Retry idempotency.** A redelivery of the same turn carries the same id, so
   the memory store recognises it as a duplicate instead of appending the
   visitor's message twice and re-running the state transition. A
   server-generated id could never do this — it changes on every retry. Two
   genuinely identical messages with different ids remain two turns.
2. **Stale-action suppression.** The browser keeps the id of the turn currently
   allowed to mutate the page. A superseded or aborted stream's actions are
   dropped before they reach `botActionBus`, so a late `filter_inventory` or
   `navigate-target` cannot navigate, refilter, highlight, compare or open a
   lead form. The prose of a stale turn is still rendered; only site mutation
   is withheld.

**Server ordering.** The deterministic path now commits its memory write
_before_ emitting any action, so a turn that loses the compare-and-set race
never emits actions at all — the race is closed at the source there, and meta
and the visible text are still sent. The model and tool paths deliberately keep
persistence after streaming: their prose arrives token by token, and buffering
a whole generation to commit first would delay the visitor's first word by the
full model latency. **For those two paths the client sequencing guard is the
authoritative protection**, which is why it is a browser-side check rather than
a server-only one: by the time a streamed turn's CAS write loses, the action
bytes have already been delivered.

This is a correctness guard layered on server authorization, not a replacement.
An action that fails the server's grounding or entitlement checks never reaches
the client at all; the client only decides whether an already-authorized action
is still current.

### Follow-up — environment audit and duplicate-turn lease (same branch)

**The Upstash question is answered: it is not configured anywhere.** A
read-only audit of the `lume-admin` Vercel project (`vercel env ls`, which
prints names and environments, never values) returns **zero** `UPSTASH_*`
entries — not Production, not Preview (staging), not Development. No Redis or
KV-shaped variable of any kind is provisioned. This matches the repository's
own record: `PROGRESS.md` still carries SCRUM-151 as
`Status: needs-provisioning(UPSTASH)`, and `apps/admin/.env.example` documents
the pair as optional with "missing values use a per-instance in-memory
fallback". Neither `scripts/verify-deployment-env.mjs` nor
`docs/deployment-environments.md` lists them, so a deployment missing them
does not even warn. Local `apps/admin/.env.local` does not set them either.

Consequences, true of **every environment today**:

- `getConversationMemoryStore()` returns the plain in-memory store, not the
  fallback wrapper. Conversation memory is therefore **per-instance**, and
  continuity across Vercel instances is already best-effort in production —
  that predates this branch and is not caused by it.
- The compare-and-set Lua **never executes**, so it remains unproven outside
  the simulator.
- `isConversationMemoryDegraded()` is always false, because there is no
  configured shared store to fail. The degraded-mode reference guards are
  therefore inert until Upstash is provisioned. They are correct and tested;
  they simply have nothing to react to yet.
- The duplicate-turn lease below is **local to one instance**, not
  distributed.

None of this is a regression; it is the standing state finally measured. The
deployed behaviour is unchanged by these commits.

**The duplicate-turn lease.** Before doing any expensive work, a turn with a
client-supplied id takes a short exclusive lease on
`<conversationMemoryKey>:turn:<requestId>`. The memory key is already a
SHA-256 of (tenant, visitor), so two tenants cannot collide even if a client
reuses an id, and neither half of the key reveals its inputs. The lease is
taken with `SET … EX … NX` — one atomic round trip — because a read-then-write
lease is not a lease.

- TTL is **120 seconds**: longer than a slow two-call tool turn, short enough
  that a crashed server frees it quickly. A visitor re-asking gets a new id,
  so this never blocks real use.
- The lease is **never released explicitly, only expired**. That means a retry
  arriving after the original completed is still refused for the rest of the
  window instead of paying for a second generation. History correctness does
  not depend on it — the `requestId` dedupe in `appendConversationMemory`
  covers that independently — so expiry can be generous without wedging a
  conversation.
- A turn without a client id is not claimed at all: a server-generated id is
  unique by construction, so there is nothing to deduplicate, and legacy
  callers keep their exact previous behaviour.
- **Failure grants rather than blocks.** If the store errors, the turn
  proceeds; refusing to answer a visitor because a lease could not be written
  would turn a cache problem into an outage. When the shared store fails, the
  fallback lease is taken and reported with `scope: "local"`, so no caller can
  report distributed idempotency it does not have.

**What the browser sees.** A duplicate delivery gets HTTP 200 with an explicit
`{"type":"duplicate"}` SSE event and nothing else — no assistant text, no
actions. A 409 or 429 would make every existing client render "chat failed"
for a turn that is actually being answered. The client ends that turn quietly:
no second assistant bubble, no error banner, pending state cleared, abort and
reset behaviour untouched. A client that ignores the event sees an empty turn
rather than a duplicated reply. The response says nothing about who holds the
lease.

**Honest limit.** If the original delivery died and its retry lands inside the
120-second window, that retry is refused and the visitor sees no answer until
they ask again. That is the deliberate trade for never double-charging a
generation, and it is bounded by the TTL.

### Follow-up — integration, browser verification, Phase 3 shadow (2026-09-18)

The work now lives on `integrate/concierge-core-hardening`, a clean worktree at
`/Users/younesshaki/Documents/LUME-concierge-integration` branched from
`origin/features/upcoming` (`fd8ee1c`). The ten hardening commits
(`072bd63`..`579239b`) cherry-picked onto it with **zero conflicts**; the only
difference between the integration tree and the original feature branch is that
branch's separate repo-hygiene commit, which is not part of this work.
`feat/concierge-core-hardening` is left intact as a reference. Nothing is
pushed or merged.

Four further commits were added there:

| Commit    | What                                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------- |
| `3b02c1d` | Shared-memory readiness in the deploy verifier, memory-mode on `/api/ready`, opt-in real-Upstash harness |
| `6b3a79e` | Browser verification of the stale-action and duplicate-turn guarantees                                   |
| `94eb4fe` | Phase 3 contextual interpretation, shadow-only, off by default                                           |
| _(this)_  | Documentation reconciliation                                                                             |

**Phase 3 is shadow-only and enabled nowhere.** Phases 4-6 remain out of scope:
no embeddings, no hybrid retrieval, no FTS, no knowledge CRUD, no reranking and
no schema work were implemented in this round.

### Phase 3 evidence-gate hardening (2026-09-18)

The first shadow implementation was reviewed before any tenant was enabled.
That review found four reasons it was not yet safe to treat shadow output as
evidence: provider failures and malformed replies disappeared from the metric,
the route awaited the experiment before returning and could add up to six
seconds of latency, unknown plan fields were silently discarded, and the gold
set had no executable scorer or minimum sample requirement.

The follow-up corrects those issues without enabling behavior:

- `chatInterpretation.ts` now rejects unknown top-level/nested fields,
  contradictory set/clear instructions, invalid ranges, impossible years,
  partially valid comparisons, and intent/payload combinations that cannot be
  executed consistently. A selected follow-up may carry only a `selected`
  reference. Relative constraints have their own typed clarification reason.
- `runShadowInterpretation()` returns an explicit outcome for every attempted
  call (`accepted`, `malformed`, `provider_error`, or `timeout`), plus duration
  and provider-reported usage. An attempted paid call can no longer disappear
  because there was no candidate to compare. Calls have a six-second deadline,
  a 600-character input cap, and a 350-token output cap.
- The public route schedules the experiment with Next.js `after()`. The real
  response never awaits it, while the platform still keeps the serverless task
  alive. One always-on, privacy-safe telemetry line records the outcome,
  duration, token usage, and disagreement field names—never visitor text,
  filter values, model output, vehicle IDs, or action parameters.
- `chatInterpretationEvaluation.ts` scores exact meaning over every expected
  turn, counts timeout/provider/malformed/missing rows as abstentions, and
  separately measures unsupported-clause retention. Duplicate or unknown rows
  cannot inflate results, and partition membership comes from the versioned
  gold set rather than caller input.
- `npm run evaluate:chat-interpretation` is an explicit-spend, fixture-only
  runner. Development is the default partition; held-out requires a second
  acknowledgement. It refuses provider fallback so the named model is the one
  being measured, and prints fixture IDs/outcomes rather than messages or
  plans.

### Phase 3 active-canary completion (2026-09-18)

The execution path is now implemented, but activation remains correctly
blocked by model evidence:

- The version-2 corpus contains 107 held-out turns across natural searches,
  refinements, resets, presentations, references, clarifications, explicit
  facet clears, and mixed/unsupported requests. Conversations remain the
  partition unit.
- Only turns the established deterministic layer cannot resolve are eligible
  for interpretation. A valid plan is compiled into canonical text, current-
  turn filters and explicit filter clears, then passed through the existing
  `transitionInventoryState` → tenant query → grounded action pipeline. There
  is no second query or action executor.
- Mixed requests and unrepresentable references are not partially executed;
  they fall back to the existing model/tool path. Provider errors, timeouts and
  malformed plans do the same.
- Active mode requires three gates: a model id in the source-controlled
  certified-model list, `CONCIERGE_CONTEXTUAL_INTERPRETER=true`, and exact
  tenant membership in `CONCIERGE_CONTEXTUAL_INTERPRETER_TENANTS`. Shadow and
  active calls are mutually exclusive for a tenant. Emptying either runtime
  flag rolls back immediately.
- Interpreted turns have their own transcript/turn route and include the
  interpreter call in token/call accounting. Shadow spend remains separate.
  Telemetry still cannot carry visitor text, filter values, plans, vehicle ids,
  action parameters, or lead data.

The evidence threshold remains at least 100 held-out turns, 98% exact match
over every held-out turn, 98% acceptance, and 100% unsupported-clause
retention. Real development evaluation produced the following results before
any held-out spend:

| Model               | Development result                                                                                | Decision                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `deepseek-v4-flash` | 0/9 accepted; every call returned a provider error                                                | Not certified; the direct provider does not accept the configured product model id.                    |
| `kimi-k2.6`         | Best run 8/9 exact; repeat 6/9 accepted because of two six-second timeouts and one malformed plan | Not certified; below the 98% development bar and not stable enough to justify a 107-call held-out run. |
| `kimi-k3`           | 5/9 accepted; four six-second timeouts                                                            | Not certified; too slow and below the quality bar for this synchronous fallback.                       |

Consequently `CERTIFIED_CONTEXTUAL_INTERPRETER_MODELS` is intentionally empty.
This is a measured rollout block, not missing execution code: setting the two
environment gates cannot accidentally promote an unqualified model. The next
step is to configure a fast provider model whose real API identifier is valid,
pass development repeatedly, then run the held-out command once and add that
exact model id to the certification list only if the report says
`activation.eligible: true`.

### Phase 3 structured-output hardening (2026-09-24)

The interpreter now uses the tenant dashboard's *resolved exact model* only:
if a selected provider is unavailable and public chat falls back to another
profile, contextual interpretation remains off. Certification is evidence for
one exact model, not a provider family.

The transport now requests provider-appropriate structured output without
making the provider the policy authority:

- Vercel AI Gateway receives a strict closed JSON Schema.
- Direct Moonshot/Kimi receives JSON-object mode.
- Other direct adapters retain the versioned JSON prompt until their API
  compatibility has separately been measured.

In every case LUME's strict `parseChatInterpretation()` parser rechecks all
keys, ranges, combinations and unsupported clauses before compiling a plan.
No structured response contains, or can authorize, an action, URL, vehicle ID,
target key, query, credential or browser command.

Run development fixtures only:

```bash
CONCIERGE_INTERPRETATION_EVAL=1 \
CONCIERGE_INTERPRETATION_EVAL_MODEL=deepseek-v4-flash \
npm run evaluate:chat-interpretation
```

Run held-out fixtures as a separate, intentional measurement:

```bash
CONCIERGE_INTERPRETATION_EVAL=1 \
CONCIERGE_INTERPRETATION_EVAL_CONFIRM=held-out \
CONCIERGE_INTERPRETATION_EVAL_MODEL=deepseek-v4-flash \
npm run evaluate:chat-interpretation -- --held-out
```

### Phase 3 Kimi K2.6 measurement — not certified (2026-09-24)

Direct Moonshot evaluation found a transport incompatibility before any quality
claim: Kimi K2.6 rejects `temperature: 0` and accepts only `0.6`. The runner
now uses that provider-required value only for Moonshot; its TypeScript parser
remains the execution authority. The model also accepts JSON-object mode. Its
restricted "moonshot flavored" JSON-Schema dialect rejects the complete closed
LUME schema, so LUME does not pretend that a weaker provider schema is an
equivalent safety guarantee.

After this compatibility fix, the nine-turn development partition scored 9/9
exact on three consecutive runs. The one-time, separately confirmed held-out
measurement was then run without further prompt tuning:

| Exact model | Held-out turns | Accepted | Exact | Unsupported retained | Decision |
| --- | ---: | ---: | ---: | ---: | --- |
| `kimi-k2.6` | 107 | 107 (100%) | 56 (52.3%) | 11/11 (100%) | **Not certified** — exact meaning is far below the 98% gate. |

Valid JSON and successful parsing are not evidence that the model understood
the visitor correctly. `CERTIFIED_CONTEXTUAL_INTERPRETER_MODELS` therefore
remains empty and neither active interpreter flag may be enabled for K2.6.
Do not tune against this held-out partition; evaluate a different exact model
or make a separately versioned change using development cases, then use a new
held-out partition for the next certification decision.

### Phase 4 implementation — lifecycle and hybrid retrieval (2026-09-19)

Phase 4 is implemented in code on `integrate/concierge-core-hardening`, but it
is deliberately **not deployed or schema-activated**. Migration 087 remains
unapplied and the live retrieval benchmark remains blocked until an approved
test database is named.

**Authoring and publication lifecycle**

- The existing Knowledge screen now creates and edits bounded plain-text
  documents, queues publication, displays draft/live revision and indexing
  state, surfaces sanitized failures, and archives instead of permanently
  deleting. All browser mutations pass `tenant_id` into role-checking RPCs.
- Document revisions are coherent: editing creates a new revision while the
  last published revision remains retrievable. The queue publishes chunks and
  flips `published_revision` inside one database function. Archiving removes a
  document from retrieval immediately and supersedes queued work.
- The durable `rag_indexing_jobs` queue uses `FOR UPDATE SKIP LOCKED`, bounded
  claims, a ten-minute stale lease, exponential retry and dead-letter after
  five attempts. The cron route uses the existing `CRON_SECRET` and service
  client pattern.
- Chunking is deterministic and bounded at 200,000 document characters and
  400 chunks. Content hashes let a replacement revision reuse matching
  768-dimensional embeddings; only changed chunks call the embedder. Vectors
  must be finite and exactly 768 dimensions.
- Local Ollama with `nomic-embed-text` is the optional no-metered-cost adapter
  chosen for this phase. If `OLLAMA_HOST` is absent or query embedding fails,
  publication and retrieval remain lexical-only. Cohere Embed remains a future
  adapter requiring a dimension/model migration, data-processing approval and
  spend limits; model generations are never mixed silently.

**Security and compatibility**

- Migration 087 removes the active-tenant anonymous table policy and revokes
  anon chunk reads. The legacy vector RPC is revoked from anon/authenticated.
  The new hybrid RPC is service-only and filters active tenant, public status,
  published document status and the exact `published_revision` at the database
  boundary. Private tenant knowledge remains unsupported by schema constraint.
- Queue internals are RLS-enabled and service-only. Editor-facing save,
  archive and enqueue functions re-check owner/admin/editor membership. The
  public chat route uses a server service client, so its RPC must and does
  enforce the complete publication scope itself rather than claiming RLS
  protects a service-role read.
- Legacy chunks are assigned a deterministic ordinal and their existing text
  is reconstructed into revision 1. Existing documents with chunks are
  promoted to public/published revision 1 because that is their pre-migration
  visibility; no legacy row is deleted. The seed script now updates only its
  own content-addressed seed documents and never clears editor content.
- Code-first rollout remains available before schema activation: only a
  missing-function/schema-cache error uses the legacy keyword reader. Other
  database failures fail closed rather than broad-reading the corpus. Once
  migration 087 is applied, the normal route never fetches the whole corpus.

**Retrieval and grounded evidence**

- PostgreSQL generated `tsvector` + GIN search and optional pgvector cosine
  candidates are fused with reciprocal-rank fusion, bounded to 50 candidates
  per channel and at most 20 returned passages (the chat requests seven).
  Empty/malformed/outage embeddings fall back through the same authorized
  lexical RPC.
- Returned evidence includes an internal chunk/document identity, document
  title, revision, publication time and retrieval channel. Prompts treat
  passages as untrusted quoted data and label them `K1…Kn`; public SSE metadata
  exposes only those turn-local handles plus safe title/revision/date—not raw
  document IDs or source URLs.
- Dashboard product help is intentionally separate from tenant RAG. It is a
  small code-versioned curated catalog whose destinations resolve through the
  closed admin capability registry. This avoids implementing global product
  help as a missing-tenant wildcard over tenant-owned content.
- Reranking remains off. English is the only declared lexical configuration in
  this phase. French, Arabic and mixed-language FTS require a measured language
  strategy rather than pretending English stemming is multilingual.

**Benchmark and activation procedure**

`npm run evaluate:rag-retrieval` compares the old in-memory keyword scorer,
database lexical retrieval and (only when Ollama is configured) hybrid
retrieval against a versioned gold fixture. It refuses database access unless
`RAG_RETRIEVAL_EVAL=1` and requires an explicitly approved
`RAG_EVAL_TENANT_ID`. It has not been run because migration 087 has not been
applied to an approved test database.

```bash
RAG_RETRIEVAL_EVAL=1 \
RAG_EVAL_TENANT_ID=<approved-test-tenant-uuid> \
SUPABASE_URL=<approved-test-project-url> \
SUPABASE_SERVICE_ROLE_KEY=<approved-test-service-key> \
npm run evaluate:rag-retrieval
```

Add `OLLAMA_HOST` and `OLLAMA_EMBED_MODEL=nomic-embed-text` to include the
semantic/hybrid arm. Do not run the bundled legacy fixture as a product-quality
approval for dealership knowledge; replace or supplement it with independently
labeled dealership questions after representative documents are authored.

Verification in the integration worktree on 2026-09-19:

| Gate | Result |
| --- | --- |
| `npm run check:migrations` | 87 sequential migration files |
| `npm run typecheck:all` | clean |
| `npm test -- --run` | 234 files / 1,831 tests passing |
| `npm run build` | clean (existing asset/chunk-size warnings only) |
| `npm run build:admin` | clean (existing middleware deprecation warning only) |
| `git diff --check` | clean |
| Migration 087 on a database | not run; explicit environment approval required |
| `npm run evaluate:rag-retrieval` | not run; depends on the approved migrated test database |

**Rollback**

Before any private visibility class exists, rollback is: stop the indexing
cron, disable publishing in the UI, and deploy the prior code while preserving
the additive columns/tables. Do not restore anonymous direct chunk reads. If a
schema rollback is ever required, keep the publication filter in a compatible
server RPC; never return to a table-wide active-tenant reader.

### Verification performed

Everything below was re-run by me in the integration worktree on 2026-09-18,
not carried forward from an earlier report:

| Gate                                      | Result                                                  |
| ----------------------------------------- | ------------------------------------------------------- |
| `npm run check:migrations`                | 86 sequential files, unchanged from `features/upcoming` |
| `npm run typecheck:all`                   | clean                                                   |
| `VITE_LUME_TENANT=default npx vitest run` | **228 files / 1794 tests passing**                      |
| `npm run build`                           | clean                                                   |
| `npm run build:admin`                     | clean                                                   |
| `git diff --check`                        | clean                                                   |
| `npm run test:e2e:concierge`              | **7 browser specs passing**                             |

The 1,642 figure previously recorded here was stale. For the record, the counts
diverge legitimately between checkouts: the main worktree reports two tests more
(1,779 at the same point) because it carries uncommitted trade-in work that adds
two cases to `dealershipBlocks.test.tsx`. That delta was verified to be exactly
those two, not a regression.

**What each class of evidence actually proves:**

- _Unit and fixture level_ — the state machine, memory contract, turn claim,
  telemetry redaction, interpretation schema and gold set. Real proof of our
  logic.
- _Browser level, mocked backend_ — that a current turn's action reaches the
  router and changes the URL, and that a superseded, aborted or duplicate turn
  does not. Real proof that the guard reaches the DOM; the chat endpoint is
  fulfilled by `page.route`, so it proves nothing about a live server.
- _Simulator level only_ — the compare-and-set Lua and the `SET NX EX` lease.
  `scripts/verify-shared-conversation-memory.mjs` exists to prove them against
  a real Upstash and **has not been run**, because there is none to run against.
- _Not verified at all_ — any live user journey against a real provider and a
  real Supabase. No live scenario run was performed. A green build proves a
  build; it does not prove a conversation.

**Standing blockers, unchanged:**

- **Upstash is provisioned in no `lume-admin` environment** (re-verified
  2026-09-18 across Development, Preview and Production; names only, values
  never read). The CAS path, the degraded-mode guards and the duplicate-turn
  lease are therefore all per-instance in every deployment today. Provisioning
  it is an external marketplace action with billing implications and was not
  performed.
- **No approved staging chat endpoint.** Staging shares the `lume-admin`
  project, and exercising it spends real provider budget against
  production-backed data.

To provision a disposable preview instance and unblock the live run, a human
with Vercel authority would add the Upstash integration to `lume-admin`
(Preview scope only), then:

```bash
VERIFY_SHARED_MEMORY=1 \
VERIFY_UPSTASH_REDIS_REST_URL=<preview url> \
VERIFY_UPSTASH_REDIS_REST_TOKEN=<preview token> \
node scripts/verify-shared-conversation-memory.mjs
```

The harness refuses the ambient `UPSTASH_*` pair on purpose, so an exported
production credential cannot be used by forgetting a flag.

## 2. Authority, constraints, and exclusions

- Read root `CLAUDE.md` and applicable `AGENTS.md` files before changing anything.
- Preserve unrelated tracked and untracked work. Record `git status --short` and the starting commit. Never reset the worktree to make this task easier.
- Do not push, merge, deploy, or apply migrations without explicit authorization for the exact action/environment.
- Treat configured Supabase connections as production-backed until verified otherwise. Localhost is not evidence that the database is local.
- Do not run a scenario that submits leads, updates vehicles, queues feeds, or creates/deletes test tenants against a shared environment without approval.
- Use `apply_patch` for source/document edits. Do not read or expose secrets to diagnose configuration; report presence and configuration names only.
- Keep public Vite and Next.js admin boundaries intact. No server-only imports or provider credentials in public client bundles.
- Preserve Basic/Pro behavior, `chat.actions`, premium model clamps, existing tenant allowlists, and persona restrictions.
- No arbitrary model-generated SQL, executable code, routes, network destinations, or tool definitions.
- No general autonomous write loop. Existing approved commands retain their confirmation, idempotency, authorization, and audit requirements.
- No mandatory second-model verifier. Optional reranking or escalation must demonstrate incremental value against its latency/cost.
- No broad UI rewrite, page-builder work, inventory transport work, or replacement authentication system.
- No separate vector database or new agent framework by default. A dependency or infrastructure addition requires a concrete gap, alternatives, and measured justification.

“Sustainable login” in the initiating discussion was interpreted as “sustainable logic.” Session isolation and authentication boundaries are included because they affect correctness; a redesign of sign-in UX is not included.

## 3. Mandatory reconciliation before implementation

### 3.1 Read in this order

1. `CLAUDE.md` and `docs/vision/product-vision.md`.
2. `docs/architecture/concierge-architecture-and-limitations-2026-07-23.md`, including the later fixes and historical limitations.
3. `docs/architecture/concierge-operator-accuracy-blueprint-2026-07-27.md`, including its progress sections. Its early “missing registry” claim is superseded by later progress and current code.
4. `docs/handoff/concierge-autonomous-testing.md`, if present, and the current scenario runner instructions.
5. Public route, state, extraction, tools, answer precedence, and frontend action consumption end to end.
6. Admin route, capability registry, planner parser, state, command confirmation route, and command execution helpers end to end.
7. Current knowledge editing/ingestion path, retrieval functions, schema, grants/RLS, and provider adapters.
8. Existing tests, scripts, and model usage instrumentation.

Do not infer deployed migration status from SQL filenames or old documents. Inspect the ledger only through an approved read-only connection before proposing schema changes. Follow the available Supabase skill and current official guidance for database work.

### 3.2 File map: verified entry points, not a claim of exhaustive audit

Line anchors refer to the September 12 checkout and will drift. Locate named symbols before editing.

| Concern                       | Current entry points                                                                    | What to inspect                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Public orchestration          | `apps/admin/app/api/chat/route.ts:245`                                                  | Tenant, plan, session, retrieval, tools, deterministic precedence, SSE                        |
| Public state                  | `apps/admin/lib/chatConversationState.ts:169`                                           | `transitionInventoryState`, reference resolution, constraint enforcement, reset/zero behavior |
| Extracted deterministic rules | `apps/admin/lib/chatDeterministicRules.ts` and `chatDeterministicAnswer.ts`             | Preserve prior bug fixes and precedence                                                       |
| Language and trusted queries  | `packages/rag/src/vehicleFilters.ts`, `vehicleTerms.ts`, `fuzzyMatch.ts`                | Phrase extraction versus authoritative filter execution                                       |
| Public tool execution         | `packages/bot/src/`, `apps/admin/lib/chatTools.ts`, `chatNavigation.ts`                 | Tool advertisement, validation, execution, action grounding                                   |
| Public client                 | `src/lib/deepseekService.ts`, `src/components/chat/OllamaChat.tsx`                      | Session lifecycle, SSE handling, action dispatch; follow imports to actual UI consumers       |
| Admin control plane           | `apps/admin/lib/adminConcierge.ts`                                                      | Capability registry, closed intent union, minimum role, confirmation                          |
| Admin route                   | `apps/admin/app/api/admin/concierge/route.ts:271`                                       | Model fallback, context, structured queries, safe responses                                   |
| Admin state                   | `apps/admin/lib/adminConciergeState.ts`                                                 | Result-set TTL, ordered IDs, selection, terse references                                      |
| Admin commands                | `apps/admin/lib/adminConciergeCommands.server.ts`, `adminConciergeCommandReceipt.ts`    | Proposal, exact target, stale-state checks, idempotency, verification                         |
| Confirm endpoint              | `apps/admin/app/api/admin/concierge/commands/[commandId]/confirm/route.ts`              | Fresh authorization and transactional execution                                               |
| Adjacent editor copilot       | `apps/admin/app/api/editor/chat/route.ts`                                               | Keep its draft/Apply contract; do not silently merge it into an operator                      |
| Shared memory                 | `packages/bot/src/conversationMemory.ts`, `apps/admin/lib/conversationMemory.server.ts` | Key scopes, TTL, serialization, fallback, concurrent updates                                  |
| Keyword retrieval             | `packages/rag/src/keywordRetrieval.ts:24`                                               | Substring/fuzzy scoring and top-k behavior                                                    |
| Semantic retrieval            | `packages/rag/src/server.ts`                                                            | Existing embedder seam and tenant vector RPC                                                  |
| Prompt evidence               | `packages/rag/src/prompt.ts`                                                            | Counts, source categories, factual boundaries, token budget                                   |
| Knowledge admin               | `apps/admin/app/admin/[tenant]/knowledge/`, `apps/admin/lib/knowledge.ts`               | Follow mutations to establish ingestion/edit behavior                                         |
| Legacy embedding tooling      | `scripts/generateEmbeddings.ts`, `scripts/seed-default-tenant.ts`                       | Seed/offline behavior; not a production incremental ingestion solution by assumption          |
| Initial vector schema         | `supabase/migrations/011_multi_tenant_foundation.sql:106`                               | 768-dimensional vectors, HNSW, document/chunk model; also inspect later policy migrations     |
| Observability and limits      | `apps/admin/lib/observability.ts:253`, `apps/admin/lib/rateLimit.ts`                    | Model metadata versus actual usage; distributed enforcement                                   |

### 3.3 Current findings to verify and classify

For each item, mark confirmed, already changed, partially addressed, or unverified. Attach current file/line evidence in the review.

1. The public route uses `retrieveByKeywords`, not `retrieveContext`, for document context.
2. It requests tenant `rag_chunks` text/category each turn without explicit corpus pagination in that query. Treat response-cap truncation as a risk to test, not a measured production incident.
3. Keyword scoring is substring/fuzzy based; the latest user message is the retrieval query.
4. Several context reads happen before the route knows whether the request needs them.
5. Inventory state, result grounding, explicit counts, and deterministic answers already exist and must be retained.
6. The dashboard already has a capability registry and a model-to-closed-plan fallback. It is not an unrestricted conversational agent.
7. Admin `compileModelIntent` sends the current message with its system prompt, without structured task context. A model `clarify` plan becomes unsupported.
8. Admin state currently focuses on one bounded result set and selection, not a general active task with pending clarification.
9. `recordModelUsage` records provider/model/fallback metadata, not input/output tokens, latency, or cost.
10. Shared memory's remote append uses a read-modify-write pattern; test concurrent updates and fallback behavior before describing an actual lost-update incident.
11. Existing rate limiting includes instance-local behavior. Verify which tenant quota paths are already shared before adding another mechanism.
12. Existing vector dimensions are 768. A function existing in source does not establish embedding completeness, provider availability, or deployed index health.

The previous analysis was code-based. It did not establish fresh production accuracy, latency, cost, or cross-session leakage measurements.

## 4. Product and safety invariants

### 4.1 Evidence authority

| Information/action                                 | Authority                                                      | Never substitute                                            |
| -------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------- |
| Price, mileage, make, availability, filtered count | Current tenant-scoped structured query                         | Similar document, prior prose, or approximate vector result |
| “Second one,” “open it”                            | Referenced server-owned ordered result set and selected entity | Newly rerun broad query                                     |
| Public policy/FAQ                                  | Published public tenant document/version                       | Another tenant's text or model general knowledge            |
| Dashboard help                                     | Curated, versioned help matching supported features            | An imagined capability from retrieved prose                 |
| Leads/customer/operational records                 | Authorized structured reads                                    | Public knowledge corpus or model memory                     |
| Write permission                                   | Current authenticated role and capability contract             | Model plan, client assertion, or document instruction       |
| Write completion                                   | Existing durable receipt and verification read                 | Model saying “done”                                         |
| Browser action completion                          | Client outcome acknowledgment with correlation ID              | Server emission alone                                       |

### 4.2 Search and preference semantics

- Search facets are scoped to the current search by default, including price.
- An explicit fresh vehicle-topic request replaces old search scope unless the user says to keep specified constraints. A refinement updates named facets while preserving the current search scope.
- “Under 10k” immediately after a result list is a refinement. “All inventory under 10k” is a broad replacement. If wording does not resolve intent sufficiently, ask one targeted question.
- A standing preference requires explicit intent, such as “keep my budget under 20k for the rest of this chat.” Do not infer durable preferences from a single search.
- Session-level preferences and profile-persisted preferences are distinct. Do not add new persistent preference writes or consent UX implicitly.
- An explicitly retained preference must be visible whenever it constrains results. A reset must state whether a separately saved preference remains; a user saying “no filters” must not be silently constrained.
- Never remove an explicit current constraint to manufacture matches. Never derive “no vehicles exist” from an incomplete sample.
- Unknown or ambiguous catalog terms produce a clarification or supported fallback—not an invented make/model.

These semantics intentionally constrain interpretation. Claude should reconcile them with the current regression tests and flag conflicts in review rather than silently rewriting product behavior.

### 4.3 Zero results and prior results

Represent the attempted query separately from any prior positive result set retained for recovery:

- A valid query returning zero has an authoritative zero-count outcome for those attempted filters.
- A query error/timeout has an unknown outcome, not zero.
- Prior positive results may be retained as an explicitly labeled previous search, but never presented as matches for the zero-yield request.
- No ordinal action may open a previous out-of-budget vehicle while the active request has zero matches.
- “Show me” after zero results must acknowledge zero; it must not reopen old matches as current.
- An explicit “restore previous search” may restore its filters and snapshot after validation.
- If existing UI keeps the old grid visible during a zero-result refinement, label it as previous results and explain the attempted filters. Prefer a zero-state current grid with an explicit restore action; confirm compatibility during review.

### 4.4 Isolation and failure behavior

- Keep public and admin namespaces separate even when sharing code.
- Scope admin memory to tenant + authenticated actor + conversation. Scope public memory to tenant + conversation; authenticated visitor identity can link preferences but must not accidentally merge independent conversations.
- Verify `startNewSession` for anonymous and authenticated visitors; do not assume its behavior is identical today.
- Never use IP address as conversational identity. IP may be one abuse-control signal.
- Stale, corrupt, inaccessible, or incompatible state must fail safely without recreating scope from old prose.
- A model timeout/malformed plan cannot bypass policy checks. Return a useful fallback; never an empty assistant message.
- Do not claim perfect real-world accuracy. Hard invariants are enforceable; natural-language understanding and document answering require measured error handling.

## 5. Target contracts and module boundaries

Use existing packages before creating new ones. Proposed names below are design sketches, not instructions to introduce duplicate types.

### 5.1 Validated turn context

Construct on the server:

```text
TurnContext
  requestId, conversationId, turnId, expectedStateVersion
  surface: public | admin
  tenantId, actorId (when authenticated)
  allowedCapabilityIds and effective entitlements
  locale and bounded current-page reference
  activeTask, activeSearch, explicitPreferences
  currentResultSetRef, selectedEntityRef, pendingClarification
```

Do not send everything to the model. Derive a minimal planner view. The admin planner can receive safe entity handles, task type, filters, and allowed capability descriptions without raw lead/customer PII. If resolving a request needs a sensitive record, retrieve only permitted fields through the executor.

### 5.2 Interpretation plan

Use a discriminated union with domain-specific schemas, not an arbitrary dictionary:

```text
search_inventory:
  operation: replace_search | refine_search | reset_search
  set: validated VehicleFilters
  clear: allowed filter keys
  preserveExplicitly: allowed filter keys
present_results:
  reference: current_result_set
select_result:
  reference: ordinal | current_selection
  ordinal: bounded positive integer when relevant
answer_knowledge:
  resolvedQuestion: bounded text
  knowledgeDomain: allowed domain
admin_capability:
  capabilityId: allowed registry entry
  arguments: that capability's validated arguments
clarify:
  reasonCode, bounded question, allowed alternatives
unsupported:
  reasonCode
```

The server attaches identity, state version, and result-set references. The model cannot choose a tenant or actor, grant permissions, supply arbitrary record IDs, or choose unregistered destinations. Existing named-entity command arguments still pass through tenant-scoped resolution.

Validation rules:

1. Reject unknown keys/types, non-finite numbers, unsupported operations, invalid ranges, and conflicting set/clear instructions.
2. Validate model terms against a cached tenant-wide catalog vocabulary, not vocabulary filtered by the old search.
3. Keep language normalization distinct from factual catalog matching.
4. Reject an interpretation that conflicts with explicit numeric bounds or known references; clarify rather than silently repair intent.
5. Do not assume schema-valid output is semantically correct. Evaluate meaning on the held-out corpus and use bounded clarification for uncertainty.
6. Build replacement filters from explicit fields and permitted retained preferences; build refinements from the current authoritative filters. The plan never directly executes a query.

### 5.3 Interpretation routing

- Preserve proven, unambiguous deterministic shortcuts.
- A shortcut reports whether it consumed the complete request; matching “BMW” must not discard the rest of a complex sentence.
- If multiple shortcuts conflict or leave material constraints unresolved, do not choose whichever runs first.
- For unresolved language, call the existing provider abstraction once for a structured plan with bounded current-task context.
- Start with a bounded single intent. For mixed requests, clarify or handle a documented independent read portion; no unbounded multi-agent planning.
- Store pending clarification structurally. “Yes” may resolve a single confirmation question, but must not choose between two alternatives silently.

### 5.4 Deterministic transition and result contract

Extend existing pure state modules and adapters:

```text
ValidatedPlan + PriorState → ProposedState + ExecutionRequest
ExecutionResult → CommittedState + AnswerFacts + AllowedActions
```

Suggested result fields:

```text
status: success | empty | unavailable | requires_clarification
filtersApplied, orderedIds, totalCount, sampleComplete
resultSetId, queryVersion, queriedAt
safeEntityFacts or authorized document evidence
```

Keep attempted/previous results explicit. `totalCount` is authoritative only for a successful query whose count was actually computed. Actions use a current compatible result set and fresh authorization/existence checks. Revalidate mutable facts when necessary without changing the referenced ordering.

### 5.5 Response and execution receipts

- Exact operational facts should be rendered by code where practical: counts, filters, prices, selected item, and command outcome.
- Model-written prose is optional and cannot replace validated actions or authoritative factual fields.
- Document responses receive scoped evidence and valid source handles. The server validates citation handles before rendering them.
- A valid citation does not prove the sentence is supported; evaluate claim support separately.
- Every response path has a nonempty textual fallback, including timeouts, presentation-only requests, blocked actions, and zero results.
- Extend the current response/SSE contract additively. Do not break old clients during rollout.
- Correlate action emission, application, rejection, and timeout using actionId/requestId/turnId. Deduplicate retries in the browser.
- A browser acknowledgment is UX telemetry, not trusted authorization or proof of a database write.
- An inventory reset must emit the action needed to clear UI filters even if the server state is already empty but the visible UI is stale.

## 6. RAG design: documents, not a substitute inventory engine

### 6.1 Separate knowledge domains

1. Public dealership knowledge: approved FAQs, policies, service descriptions, contact details, and applicable terms.
2. Dashboard product help: curated LUME feature documentation tied to the supported capability registry and product version.
3. Optional private tenant operational knowledge: only after visibility enforcement and publication controls are implemented and tested.

Do not place raw leads, identity documents, credit applications, credentials, or customer histories into a general shared embedding corpus. Those remain structured, permission-checked data unless a separately reviewed use case proves otherwise.

Global product help and tenant-specific knowledge need explicit scopes. Do not implement global documents by treating missing tenant ID as a wildcard in tenant queries.

### 6.2 Ingestion and publication lifecycle

Inspect current document mutations before choosing a worker implementation. Reuse an existing durable job facility only if it supports this workload cleanly; do not overload a webhook/inventory payload or synchronous chat request to avoid designing the right contract.

Required lifecycle:

1. Accept existing supported content formats first. Expanding to arbitrary PDF/OCR/web crawling is a separate parser/security decision.
2. Authenticate editor, resolve tenant, validate format/size, normalize text, and preserve section headings and source metadata.
3. Compute a content hash. Skip unchanged content and embed changed chunks only.
4. Chunk by meaningful sections; begin experiments around 300–600 tokens with limited overlap, then tune on answer retrieval. These are starting parameters, not universal defaults.
5. Record document revision, chunk ordinal, source location, language, publication/visibility status, content hash, embedding model/version/dimension, and processing status using existing fields where possible.
6. Queue embedding with deduplication, retry/backoff, bounded concurrency, and an observable failure state. Retries must not duplicate published chunks.
7. Validate finite vectors and exact expected dimensions. Query and document embeddings must use the same compatible model/version.
8. Publish a coherent revision only when ready. An ordinary update may keep the last published revision active until its replacement is ready; an explicit revoke/delete must remove access immediately.
9. Invalidate corpus-version caches and prevent old workers from republishing a deleted or superseded revision.
10. Expose ready/pending/failed status through the existing knowledge surface with useful, sanitized errors.

No destructive re-seeding. Existing chunks lacking new metadata require an explicit compatibility/backfill plan. Do not silently classify unknown legacy content as private or public without reviewing current visibility expectations.

### 6.3 Tenant and role-safe retrieval

- Extend the existing document/chunk system rather than introducing a parallel vector store.
- Enforce tenant, audience, publication status, and permitted role at the database/retrieval boundary and again when constructing returned evidence.
- Inspect direct table grants, existing anon policies, RPCs, views, and caches—not only the new API wrapper. A server-side visibility filter does not protect a table still readable through the Data API.
- Prefer RLS-respecting authenticated reads. If a trusted server path needs service-role access, enforce the full scope there; do not claim RLS protects a service-role query.
- A public-active-tenant vector RPC is not automatically appropriate for private admin documents. Review function grants and security mode before reuse.
- Add visibility enforcement and tests before ingesting private content. Deny by default on unknown visibility.

### 6.4 Retrieval algorithm

Use PostgreSQL full-text retrieval and compatible pgvector retrieval over the same authorized published scope, then fuse rankings. Supabase documents this combination and reciprocal rank fusion: [official hybrid-search guide](https://supabase.com/docs/guides/ai/hybrid-search).

Initial experiment configuration:

- Retrieve approximately 20 lexical and 20 semantic candidates, bounded server-side.
- Deduplicate by document revision/chunk ID and combine ranks; start with a conventional configurable RRF constant, then evaluate it.
- Select roughly 4–8 diverse, relevant passages within an explicit context token budget.
- Preserve adjacent context when needed to avoid truncating qualifications or exceptions.
- Resolve knowledge follow-ups from current task context; do not retrieve on bare “does that apply here?” without resolving “that.”
- Use a planner-provided standalone question when already available. Do not add a query-rewrite model call to every request.
- Choose language-aware lexical configuration. Do not assume English stemming covers French, Arabic, or mixed-language requests; establish supported languages with the owner.
- Apply publication/effective-date precedence explicitly for conflicting document versions. If authoritative sources still conflict, explain the uncertainty instead of merging incompatible policies.

For small tenant corpora, benchmark exact vector search against ANN. Approximate vector indexes can under-return after selective filtering; test tenant-specific recall and the installed pgvector version before choosing iterative scans or index changes. See [pgvector filtering](https://github.com/pgvector/pgvector#filtering).

Do not interpret cosine similarity or an RRF score as a probability that an answer is correct. Calibrate retrieval sufficiency against labeled answerable/unanswerable examples.

### 6.5 Grounded answering and citations

Return evidence records containing stable source handles, document title, revision, section/location, bounded text, and publication timestamp where available.

- Restrict the model to authorized evidence and separately supplied live facts.
- Treat all retrieved prose as untrusted data, never system instructions.
- Validate cited handles against the actual retrieved set. Render only safe, authorized source links.
- Do not expose internal document IDs/URLs or raw prompts unnecessarily to public clients.
- Distinguish “the policy says no” from “I could not find a policy answering that.”
- For financial or eligibility questions, explain published policy without inventing approval, guarantees, or lender decisions.
- Evaluate unsupported claims and omitted exceptions, not merely whether a citation appears.

### 6.6 Optional reranking

Default: off. First determine whether failures are missing candidates, wrong ranking, poor chunking, ambiguity, or answer generation.

Enable a bounded reranker only for document routes where held-out evidence shows sufficient accuracy gain. Record added latency/cost and compare with improved lexical queries/chunking. Do not rerank structured inventory queries or ordinal actions. An escalation model cannot override permissions, filters, or zero-result truth.

## 7. Sessions, concurrency, and authentication

### 7.1 Reuse the memory store; strengthen its contract

- Extend the existing backend and TTL configuration rather than adding another session service.
- Add schemaVersion and monotonic stateVersion, with an explicit compatibility policy.
- Use compare-and-set or a backend-appropriate atomic transition. No unguarded GET → modify → SET for authoritative concurrent turns.
- Deduplicate request IDs. Reject, queue, or serialize conflicting turns under a documented policy; do not replay model calls or writes accidentally on a CAS retry.
- Return the committed version. Clients ignore stale responses/actions from an older turn after a newer turn is active.
- Keep bounded message history for language context; never rebuild authoritative filters from assistant prose when structured state is missing.
- In production, shared-store failure must be visible. Do not silently switch to an independent per-instance conversational history and claim continuity.
- Permit safe stateless questions during memory outage if possible; block unresolved references and explain that the prior selection is unavailable.

### 7.2 Identity and access tests

Cover independent anonymous sessions behind the same IP; two admin actors; the same actor in two conversations; tenant switching; start-new; logout/login; expiry; corrupted state; and permission revocation between proposal and confirmation.

An opaque session ID is a namespace, not an authorization credential. Review binding/replay protection for public memory endpoints before storing sensitive context. Never expose private history merely because a caller knows an ID.

Writes always re-check current role and exact target at confirmation. Retrieval caches must not retain access after revocation. Avoid putting raw PII into planner prompts, cache keys, or analytics logs.

## 8. Latency, cost, and observability

### 8.1 Expected call budgets

| Request class                                | Intended default model usage                          | Other work                                            |
| -------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| Unambiguous stored reference/navigation      | Zero                                                  | State/existence checks and UI action                  |
| Deterministically understood inventory query | Zero                                                  | Scoped SQL + deterministic answer                     |
| Novel inventory phrasing                     | One bounded interpretation                            | SQL + deterministic answer                            |
| Straightforward knowledge question           | One answer generation                                 | Query embedding + retrieval; embedding is metered too |
| Ambiguous knowledge follow-up                | At most a bounded additional interpretation if needed | Measure separately; do not hide extra calls           |
| Admin read                                   | Zero or one interpretation                            | Authorized structured handler                         |
| Approved admin write                         | Zero or one interpretation before proposal            | Existing confirmation/execution/verification path     |

These are design budgets, not claims about today's measurements. Keep provider failure retries bounded by a turn deadline. Do not change tenant model choices, entitlement clamps, or provider data-processing terms silently.

### 8.2 Optimize only after correctness is measurable

- Load only the data required for a route. Do not fetch the knowledge corpus, loyalty, and preference context for every ordinal request.
- Cache tenant-wide vocabulary by catalog version with a short TTL fallback; catalog mutation invalidation must be defined.
- Cache published document retrieval with tenant/audience/role scope, language, corpus version, embedding version, normalized resolved query, and retrieval configuration.
- Cache content, not authorization decisions. Revalidate effective access on each request.
- Avoid global caches of personalized answers, live inventory counts, or PII. Inventory cache use needs explicit freshness bounds and invalidation coverage across feed/manual changes.
- Keep stable prompt prefixes small and versioned. Use provider prompt caching only where supported and benchmarked.
- Bound tool iterations, candidate counts, history, tokens, request time, and worker concurrency.
- Reuse existing quota/accounting infrastructure where available. Add shared tenant/user/conversation throttles and abuse controls where missing; IP alone is insufficient.
- Reserve estimated spend before model work when implementing hard budgets; reconcile actual usage afterward. Concurrent calls must not all pass the same remaining-budget check.

### 8.3 Required telemetry

Extend existing observability helpers; do not create a second logging pipeline without need.

Per turn record safe structured fields:

- request/turn/conversation correlation IDs, surface, tenant, policy/state/schema versions;
- selected route, deterministic/model path, reason codes, clarification outcome;
- validated filter transitions in controlled debugging, with redaction for sensitive arguments;
- query outcome/count/completeness, evidence IDs/revisions, retrieval configuration;
- proposed/emitted/dropped/applied actions and guard reason codes;
- provider/model requested and effective, fallback, attempts;
- actual input/output/cached/reasoning tokens where supplied, embedding/rerank usage;
- stage timings, time to first meaningful response, time to action applied, total duration;
- estimated cost with price-table version, and whether usage was actual or estimated;
- safe error classification and retry/deadline behavior.

If upstream usage is missing, report unknown or estimated—never zero by default. Do not log chain-of-thought, credentials, unrestricted prompts, or raw customer data. Routine production metrics must not depend on enabling raw transcript logging. Keep transcript capture opt-in, redacted, access-controlled, retained briefly, and configurable per environment.

Example record, illustrative rather than a required wire schema:

```json
{
  "scope": "concierge.turn",
  "surface": "public",
  "requestId": "redacted-example",
  "route": "inventory.search",
  "interpretation": "model",
  "stateVersionBefore": 12,
  "stateVersionAfter": 13,
  "ruleCodes": ["replace_search", "clear_previous_price_scope"],
  "result": { "status": "success", "totalCount": 9 },
  "modelCalls": 1,
  "usage": { "inputTokens": 700, "outputTokens": 65, "source": "provider" },
  "timingsMs": { "interpretation": 480, "query": 65, "total": 630 },
  "action": { "type": "filter_inventory", "status": "emitted" }
}
```

Numbers above are invented examples, not observed performance.

### 8.4 Model and embedding selection

Benchmark candidates through existing provider adapters on LUME tasks. Record current model IDs, prices, region/retention terms, structured-output reliability, rate limits, multilingual quality, and measured latency. Never choose a model from a marketing ranking alone.

Use one compatible embedding model/version per active index generation. A same-dimension model change still requires re-embedding; dimensions alone do not make vector spaces compatible. Keep an old compatible generation available during an approved migration rather than rewriting live vectors in place.

No fine-tuning, GraphRAG, dedicated vector service, or general verifier in the first rollout. Reconsider only with a measured failure class and comparison against simpler remedies.

## 9. Evaluation and acceptance strategy

### 9.1 Build on existing tests

Extend, do not replace:

- `scripts/run-concierge-scenarios.mjs` and `scripts/read-concierge-transcript.mjs`;
- `scripts/concierge-scenarios.mjs`, `concierge-scenarios-explore*.mjs`, and `concierge-scenarios-state-drift.mjs`;
- `scripts/concierge-session-isolation.mjs`;
- `apps/admin/lib/adminConciergeEval.ts` and its tests;
- state, deterministic rule, route-contract, command receipt, and memory tests already present.

Use controlled fixtures for exact counts. Existing live catalog totals such as 9 Camrys or 1,283 vehicles are historical observations, not permanent assertions. A live test should compare against an independently constructed authorized catalog query, not the concierge's own extraction helper as its oracle.

### 9.2 Mandatory public conversation sequences

1. BMW $30k–$70k → only $40k–$55k → show me → open second. Verify filters, count, order, displayed chips, URL, and selected ID.
2. BMW under $70k → 2026 Camry → Cadillac → broad $20k query returning zero → Camry → BMW SUVs. Verify no invisible old cap; compare final count with the fresh catalog query.
3. Verified Camry result → show me → go back → back to inventory → show me repeatedly. Every response nonempty; reset changes UI, not just text.
4. Toyota search → “I'm not talking about Toyota, I'm talking in general” → “yes all inventory under 10k.” No stranded make/model/year/budget.
5. Positive results → zero-yield budget refinement → open second. No previous out-of-budget action; explicit restore required.
6. “Yes” after a two-option question → targeted clarifier → chosen option. No silent guessing.
7. Explicit session budget → model switch → visible retained budget → “no filters.” Verify declared preference semantics.
8. At least five distinct 10–30-turn chains mixing reset, make/model switch, comparison, ordinal, selection, knowledge, and inventory re-entry.
9. Late response from turn N arrives after N+1. No stale filters or navigation applied.

Use exact prior transcript phrases as regressions plus held-out paraphrases, typos, punctuation, negation, and supported languages. Do not optimize only to known strings.

### 9.3 Mandatory dashboard sequences

1. Search vehicles → refine compatible filters → show results → open ordinal, preserving ordering.
2. Search leads → open selected lead → proposed supported status update → explicit confirmation → verified receipt. Use a fake/approved test environment.
3. Ambiguous entity name → clarify → unique target. No model-selected UUID.
4. “How do I do X?” retrieves help; “Do X” requires a supported capability. Help text cannot create permission to act.
5. Unsupported bulk action, arbitrary URL, tool-name injection, cross-tenant target, and unauthorized capability all fail safely.
6. Role revoked, record changed, command expired, or duplicate confirmation between proposal and execution. Preserve stale-state/idempotency behavior.
7. Editor copilot still requires Apply and cannot acquire dashboard write privileges through shared modules.

### 9.4 RAG, security, and failure tests

- Known answer passages, paraphrases, exact terms, exceptions, mixed-language questions, and genuinely unanswerable questions.
- New/revised/deleted/revoked documents; partial embedding failure; duplicate jobs; stale worker completion; incompatible vectors.
- Tenant A cannot retrieve tenant B; public cannot retrieve private; viewer cannot retrieve restricted content; repeat through direct API/RPC and caches.
- Prompt injection inside a document cannot request tools, override filters, or disclose private context.
- Valid-looking but unsupported citations and claims are detected by tests/review.
- Provider 429/timeout/malformed JSON, missing token usage, memory outage, DB timeout, zero versus unknown, and browser action failure.
- Exact-versus-ANN recall under many tenants and skewed corpus sizes. Load-test only a permitted environment with bounded spend.

### 9.5 Release criteria

Hard gates:

- All previously supported regression sequences pass.
- No observed cross-tenant/role disclosure, unauthorized write, ordinal mismatch, constraint-violating action, blank reply, or false write-success claim in the release suite.
- Pure state transitions are non-mutating, schema validated, and covered for resets, preferences, zero results, expiry, and concurrency.
- Browser tests verify actual filters/grid/URL/selection, not just HTTP action JSON.
- RAG benchmarks improve answer-support retrieval over the current keyword baseline without worsening private-data access or unanswerable-question behavior.

Provisional performance/quality targets to approve after baseline measurement:

| Metric                                  | Initial target, not an existing result                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Gold-set interpretation exact match     | At least 98% on supported intents; report by surface/language and sample size                                 |
| Supporting evidence recall@8            | At least 95% on answerable knowledge examples                                                                 |
| Supported factual claims                | At least 98% on human-reviewed document answers; report unsupported-claim rate separately                     |
| Warm deterministic action response p95  | At most 750 ms server-side; separately measure browser application                                            |
| Warm one-model inventory task p95       | At most 2.5 s end-to-end server response                                                                      |
| Knowledge first meaningful response p95 | At most 3 s; separately report full-answer completion and cold starts                                         |
| Cost per successful task                | No regression for existing supported tasks; owner approves an absolute monthly/tenant envelope after baseline |

Do not treat these percentages as statistical certainty. Record numerator, denominator, abstentions, coverage, and confidence intervals where useful. Use separate development and held-out sets, grouped by conversation/document to reduce leakage. A system that refuses everything must fail the successful-completion metric.

## 10. Phased execution plan

### Phase 0 — Reconciliation, review, and baseline

Changes: tests/fixtures and review artifacts only after authorization; no behavior change.

Tasks:

- Complete Section 3's finding matrix and document plan conflicts.
- Inventory existing flags, commands, memory formats, quotas, schema/policies, and provider support.
- Establish public/admin task taxonomy and supported languages.
- Capture deterministic fixture baselines plus approved live read-only transcripts.
- Agree zero-result UX, session preference behavior, retention, provider/data policy, absolute spending envelope, and rollout environment.

Deliverable: short review, amendment list, baseline report, and commit plan. Stop for unresolved product/security decisions; continue independent safe work where possible.

### Phase 1 — Instrumentation and reusable test harness

Likely files: `observability.ts`, provider adapters found through current routes, existing scenario/evaluation scripts, related tests.

Tasks:

- Add request correlation, stage timings, actual/estimated usage, safe outcome categories, and non-sensitive evaluation exports.
- Capture structured plan/state/query/action outcomes without requiring raw transcript logs.
- Add fixture-driven route tests and browser assertions for the historical failures.
- Establish a versioned baseline and held-out test partition.

Acceptance: existing behavior unchanged; tokens unknown are not zero; logs contain no secrets/PII fixtures; all baseline tests pass.

Rollback: disable new telemetry sink/flags; no session/schema dependence. Avoid an irreversible logging schema migration.

### Phase 2 — State and execution contracts

Likely files: existing public/admin state modules, `packages/bot/src/conversationMemory.ts`, `conversationMemory.server.ts`, deterministic rule/answer modules, minimal route adapters.

Tasks:

- Introduce shared envelope concepts while retaining surface-specific state and capabilities.
- Separate active request, explicit preferences, attempted zero-result outcome, previous results, and pending clarification.
- Make versioned/atomic memory updates and explicit outage behavior.
- Have existing deterministic paths produce/consume the normalized plan and result contract.
- Preserve old memory compatibility; test downgrade/rollback behavior before rollout.

Acceptance: unchanged supported behavior except reviewed bug fixes; all long sequences and concurrency/isolation tests pass without depending on a model.

Rollback: old adapter remains available behind a version-aware flag. Never let old code interpret new state fields unsafely; reset incompatible session state with an explanation if necessary.

### Phase 3 — Contextual language interpretation

Likely files: `adminConcierge.ts`, admin planner route seam, `packages/rag/src/vehicleFilters.ts`, proposed small pure planner/validator modules, public/admin route wiring.

Tasks:

- Adapt existing deterministic compilers to the same closed plan schema.
- Add bounded contextual model interpretation for unresolved public language and contextual admin follow-ups.
- Implement real typed clarification rather than collapsing it to unsupported.
- Preserve tenant model settings, entitlement clamps, and existing provider abstractions.
- Shadow proposed plans against established behavior, then adjudicate differences against independent gold outcomes.

Shadow rules: never execute candidate actions/writes, never commit candidate state, and cap/scope additional model spend. A shadow mismatch is not automatically a new-plan error or an old-plan error.

Acceptance: held-out interpretation improves; known regressions remain green; unsupported clauses do not get dropped; default call budgets hold.

Rollback: surface-specific planner flag to old interpreter while retaining safety validators.

### Phase 4 — Document lifecycle and hybrid RAG

Likely files: `packages/rag/src/server.ts`, retrieval/types/prompt modules, existing knowledge admin mutations/UI, existing worker seam after inspection, additive migrations if approved for authoring.

Tasks:

- Specify metadata/visibility/revision additions, grants/RLS, worker lifecycle, compatibility, and reversible rollout before writing SQL.
- Implement incremental embedding, coherent publication, revocation, and compatible model-version tracking.
- Add bounded scoped hybrid retrieval and source handles.
- Integrate public knowledge and curated admin help; keep private tenant knowledge disabled until all direct-access/cache isolation tests pass.
- Benchmark against keyword-only and vector-only retrieval. Keep authorized lexical fallback on embedding outage where useful; otherwise return evidence unavailable.

Acceptance: source grounding, lifecycle, direct-access security, and retrieval benchmarks pass on an approved test database. No whole-corpus fetch on the enabled hybrid path.

Rollback: stop publishing the new retrieval generation and use a visibility-safe compatible path. Never roll back to a legacy public reader after private data has been introduced into its readable scope.

Migration checkpoint: code and unapplied migration may be reviewed without live schema access. Do not claim deployed verification until approved application/backfill/index checks have completed.

### Phase 5 — UI outcome verification and scale controls

Likely files: current public/admin response consumers, action dispatchers located during Phase 0, observability, quota/rate-limit and memory adapters.

Tasks:

- Add action acknowledgment, stale-turn suppression, deduplication, and visible failure states.
- Make browser filters derive from the same validated result/filter contract as backend queries.
- Add scoped/versioned caches and distributed limits only where baseline identifies missing coverage.
- Add bounded spend reservations and reconcile usage if a hard budget is enabled.
- Load-test agreed tenant/corpus/conversation sizes, both warm and cold, and degraded dependencies.

Acceptance: no UI success claim on failed action; no private cache leakage; no stale state overwrite; latency/cost measurements meet approved gates.

Rollback: disable caches/optional acknowledgments independently, not policy checks or write idempotency.

### Phase 6 — Controlled rollout and handoff

Tasks:

- Re-run complete unit/type/build gates and approved live/browser suites.
- Canary by explicit tenant and surface, not globally. Start with read-only behavior; keep existing write confirmations unchanged.
- Compare real completion, clarification, unsupported claims, latency, cost, and failure reasons with baseline.
- Any isolation/unauthorized-write failure stops rollout immediately. Define numeric non-security rollback thresholds from the agreed baseline before enabling the canary.
- Update both existing architecture documents so old “missing” sections do not mislead the next agent.
- Remove obsolete duplicate routing only after the new path proves equivalent or better; retain regression tests.

Deliverable: reviewed commits, test and benchmark evidence, configuration/runbook, migration/backfill status, rollback instructions, and remaining limitations.

## 11. Verification commands and environment safety

Inspect current scripts before running them. The following are the expected local code gates:

```bash
npm run typecheck:all
VITE_LUME_TENANT=default npx vitest run
npm run build
npm run build:admin
npm run check:migrations
git diff --check
```

Do not weaken tests or remove historic assertions to make these pass. Separate pre-existing failures from introduced failures with baseline evidence.

For approved local UI testing, first inspect listeners on 5173/3100 and identify whether this checkout owns them. Do not kill unrelated processes. If free, run the public site with its existing API host override targeting `http://127.0.0.1:3100`, and run Next.js from `apps/admin` on 3100. Verify current Vite configuration recognizes `VITE_ADMIN_API_HOST` before relying on it. No need to write secrets or alter production environment files.

`npm run test:e2e` is not automatically safe: `CLAUDE.md` documents that it can create/delete a user and tenant against the configured Supabase project. Inspect Playwright/scenario setup and obtain a disposable/approved environment before any mutation test. Read-only chat tests can still incur provider charges and produce logs; cap calls and do not load-test production by accident.

For every gate, record command, commit, environment classification, outcome, and relevant artifact. A successful build is not live verification; a successful HTTP response is not proof that a browser action worked.

## 12. Decisions deferred or requiring owner confirmation

Review these together rather than interrupting implementation for trivial choices:

1. Approve search-scoped budgets by default, explicit retained preferences, and the zero-result/restore UI contract.
2. Confirm first-release languages and the representative task mix.
3. Approve any external embedding/reranking provider, retention terms, and spending ceiling; existing chat-provider approval is not blanket approval to send private documents elsewhere. The current shortlist is Cohere Embed v4 versus a properly operated local multilingual E5 service; keyword/fuzzy retrieval remains active until this decision and its prerequisites are complete.
4. Name the disposable test environment and migration/backfill approval process.
5. Decide whether private tenant documents belong in this release. The safe default is public knowledge plus curated dashboard help only.
6. Approve provisional latency/quality targets after baseline measurement and decide the monthly tenant cost envelope.

Deferred by default: fine-tuning, automatic model-verifier chains, GraphRAG, arbitrary website crawling, OCR-heavy ingestion, broad autonomous admin writes, new sensitive-data embedding use cases, and a replacement agent/vector platform.

## 13. Definition of done and final report template

The work is complete only when the approved phases are implemented, tested, and verified in their authorized environment—not when a plan, schema file, or model demo exists.

Claude's final report must contain:

1. What already existed and was reused; what changed; exact files/commits.
2. Public and dashboard request paths, including which requests avoid model calls.
3. State, preferences, zero-result, clarification, expiry, concurrency, and rollback semantics.
4. Knowledge lifecycle, embedding compatibility, visibility enforcement, citations, and failure behavior.
5. Every historical regression's result plus held-out interpretation/retrieval/grounding measurements, denominators, and limitations.
6. Browser evidence that actual filters/navigation/selection agree with backend results.
7. Isolation/authorization/idempotency evidence and sensitive-data handling.
8. Latency distributions, actual or estimated usage, cost per successful task, and load-test conditions.
9. All code gates and live verification results; explicit distinction between unapplied migrations and verified deployed behavior.
10. Flags, canary/rollback procedure, required owner actions, and deferred work.

Guiding principle: let language be flexible, but keep identity, authorization, state, evidence, and execution explicit. RAG improves access to knowledge; the deterministic execution core makes the concierge trustworthy as an actor in LUME.
