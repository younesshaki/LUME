import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { deterministicSourceCategories } from "./chatAnswers";

const route = readFileSync(
  resolve(process.cwd(), "apps/admin/app/api/chat/route.ts"),
  "utf8",
);
const observability = readFileSync(
  resolve(process.cwd(), "apps/admin/lib/observability.ts"),
  "utf8",
);

/**
 * Conditional-context contract for the public concierge handler.
 *
 * These are source-ordering assertions, the same technique
 * adminConciergeRouteContract.test.ts uses, and for the same reason: the root
 * vitest config aliases `@` to the public Vite app's `src`, so this Next.js
 * route handler cannot be imported and executed here. Ordering is however the
 * whole invariant — the deterministic branch ends in an unconditional
 * `return`, so "the corpus query is written after that return" is exactly
 * equivalent to "an ordinal turn never issues the corpus query".
 *
 * A runtime assertion on the same guarantee belongs in the scenario runner,
 * which drives the deployed route; see scripts/run-concierge-scenarios.mjs.
 */
const DETERMINISTIC_RETURN =
  "return new Response(stream, { headers: sseHeaders });";
const CORPUS_QUERY = '.from("rag_chunks")';
const HYBRID_RETRIEVAL = "retrieveHybridContext({";
const FACETS_RPC = 'supabase.rpc("vehicle_facets_v2"';
const LOYALTY_CALL = "loadChatLoyaltyContext(supabase";
const PREFERENCES_CALL = "loadVisitorPreferenceContext(supabase";
const IMAGE_DESCRIPTIONS = '.from("vehicle_images")';
const SELECTED_VEHICLE_FETCH =
  "getTenantVehicle(supabase, tenant.tenantId, selectedVehicleCandidate)";
const DETERMINISTIC_GUARD = "if (hasDeterministicAnswer(";

const at = (needle: string) => {
  const index = route.indexOf(needle);
  expect(index, `expected to find ${needle} in the route`).toBeGreaterThan(-1);
  return index;
};

describe("public chat route: model-only context is deferred", () => {
  it("queries the document corpus only after the deterministic branch returns", () => {
    // The first `return new Response(stream, ...)` in the file is the
    // deterministic early return. Anything written after it cannot run for a
    // turn a verified-state rule already answered.
    expect(at(CORPUS_QUERY)).toBeGreaterThan(at(DETERMINISTIC_RETURN));
  });

  it("uses bounded database-side hybrid retrieval on the normal model path", () => {
    expect(at(HYBRID_RETRIEVAL)).toBeGreaterThan(at(DETERMINISTIC_RETURN));
    const call = route.slice(at(HYBRID_RETRIEVAL), at(HYBRID_RETRIEVAL) + 300);
    expect(call).toContain("tenantId");
    expect(call).toContain("topK: 7");
  });

  it("uses the whole-corpus reader only as a migration-compatibility fallback", () => {
    const loader = at("async function loadPublishedKnowledgeContext(");
    const body = route.slice(loader, loader + 1_800);
    expect(body).toContain(
      "hybrid_rag_chunks_for_tenant|schema cache|could not find",
    );
    expect(body.indexOf(CORPUS_QUERY)).toBeGreaterThan(
      body.indexOf("if (!/hybrid_rag_chunks_for_tenant"),
    );
  });

  it("reads loyalty and visitor preferences only on the model path", () => {
    // Both feed the system prompt exclusively (single consumer: systemMessage).
    expect(at(LOYALTY_CALL)).toBeGreaterThan(at(DETERMINISTIC_RETURN));
    expect(at(PREFERENCES_CALL)).toBeGreaterThan(at(DETERMINISTIC_RETURN));
  });

  it("fetches primary-image descriptions only on the model path", () => {
    expect(at(IMAGE_DESCRIPTIONS)).toBeGreaterThan(at(DETERMINISTIC_RETURN));
  });

  it("keeps the tenant facet vocabulary on every turn", () => {
    // Regression guard for the 2026-07-23 BMW -> Camry bug: extraction needs
    // tenant-wide vocabulary BEFORE the state transition decides anything, so
    // this RPC must stay ahead of the deterministic guard, not be deferred
    // with the model-only reads.
    expect(at(FACETS_RPC)).toBeLessThan(at(DETERMINISTIC_GUARD));
  });

  it("keeps the selected-vehicle read ahead of the deterministic branch", () => {
    // "tell me more about it" is answered deterministically from this row, so
    // deferring it would break that answer rather than save a query.
    expect(at(SELECTED_VEHICLE_FETCH)).toBeLessThan(at(DETERMINISTIC_GUARD));
  });

  it("issues exactly one corpus query, so no branch can reintroduce an eager read", () => {
    const occurrences = route.split(CORPUS_QUERY).length - 1;
    expect(occurrences).toBe(1);
  });
});

describe("public chat route: turn telemetry", () => {
  it("records a turn on every response path", () => {
    // Deterministic, prose-model and tool-model each end in their own
    // Response; a path without a record is a silent hole in the metrics.
    const deterministic = route.indexOf(
      'route: activeInterpretationApplied ? "interpreted" : "deterministic"',
    );
    const prose = route.indexOf('recordModelTurn({ route: "model"');
    const tool = route.indexOf('recordModelTurn({ route: "tool"');
    expect(deterministic).toBeGreaterThan(-1);
    expect(prose).toBeGreaterThan(-1);
    expect(tool).toBeGreaterThan(-1);
  });

  it("does not gate turn telemetry behind the transcript debug flag", () => {
    // captureConciergeTranscript and captureDebug are opt-in because they
    // carry raw visitor text. Routine metrics must not require switching that
    // on, so recordConciergeTurn's body must contain no flag check.
    const observability = readFileSync(
      resolve(process.cwd(), "apps/admin/lib/observability.ts"),
      "utf8",
    );
    const recorderStart = observability.indexOf(
      "export function recordConciergeTurn(",
    );
    expect(recorderStart).toBeGreaterThan(-1);
    const recorderBody = observability.slice(recorderStart);
    expect(recorderBody).not.toContain("LUME_CHAT_DEBUG");

    // ...while the transcript capture must keep its gate.
    const transcriptStart = observability.indexOf(
      "export function captureConciergeTranscript(",
    );
    const transcriptBody = observability.slice(transcriptStart, recorderStart);
    expect(transcriptBody).toContain("LUME_CHAT_DEBUG");
  });

  it("reports model usage only when the deterministic answer came through interpretation", () => {
    const index = at(
      'route: activeInterpretationApplied ? "interpreted" : "deterministic"',
    );
    const window = route.slice(index, index + 1300);
    expect(window).toContain("activeInterpretationResult && chatProvider");
    expect(window).toContain(": null");
  });
});

describe("public chat route: memory lifecycle wiring", () => {
  it("reads the state version at turn start and commits against it", () => {
    // Without this the CAS guard exists but nothing uses it, and a late turn
    // still overwrites the newer one that already landed.
    expect(route).toContain("remembered?.stateVersion ?? 0");
    expect(at("expectedStateVersion")).toBeGreaterThan(-1);
  });

  it("routes every persisted turn through one versioned writer", () => {
    // Three response paths write memory. Three hand-rolled appends drift;
    // one helper cannot.
    const writes = route.split("persistTurnMemory({").length - 1;
    expect(writes).toBe(3);
    // The one append in the file carries both the turn id and the version.
    const appends = route.split("memoryStore.append(").length - 1;
    expect(appends).toBe(1);
    const append = at("memoryStore.append(");
    const body = route.slice(append, append + 200);
    expect(body).toContain("...update");
    expect(body).toContain("requestId");
    expect(body).toContain("expectedStateVersion");
  });

  it("treats a lost race as expected rather than as an error", () => {
    // A conflict is a healthy store refusing a stale write, not an incident.
    const guard = at("error instanceof ConversationMemoryConflictError");
    // The conflict branch only, up to its early return.
    const branch = route.slice(
      guard,
      route.indexOf('return "conflict";', guard),
    );
    expect(branch).toContain("memory-conflict");
    expect(branch).not.toContain("captureError");
  });

  it("stamps the turn id so a replayed request cannot double-append", () => {
    const append = at("memoryStore.append(");
    expect(route.slice(append, append + 200)).toContain("requestId");
  });
});

describe("public chat route: client-supplied turn id", () => {
  it("adopts a valid client id instead of always generating its own", () => {
    // A server-generated id changes on every retry, so it can never identify
    // a duplicate delivery. Retry dedupe only works with the browser's id.
    expect(route).toContain("normalizeClientRequestId(body.requestId)");
    expect(route).toContain("clientRequestId ?? crypto.randomUUID()");
  });

  it("validates the shape rather than trusting the body", () => {
    const validator = at("function normalizeClientRequestId(");
    const body = route.slice(validator, validator + 400);
    expect(body).toContain("UUID_PATTERN.test");
  });

  it("echoes the turn id in meta so the browser can correlate its stream", () => {
    const meta = at("const buildMetaEvent =");
    const end = route.indexOf("const deterministicAnswers", meta);
    expect(route.slice(meta, end)).toContain("requestId");
  });

  it("records only whether an id was client-supplied, never the id's origin detail", () => {
    // Turn telemetry (deterministic + model paths) and the speed timing
    // record: all three store the boolean only.
    const records =
      route.split("clientRequestId: clientRequestId !== null").length - 1;
    expect(records).toBe(3);
    expect(route).not.toMatch(/clientRequestId: clientRequestId(?! !== null)/);
  });

  it("keeps one UUID shape check for both the turn id and the session id", () => {
    // Two hand-written UUID regexes drift; the session id check was inlined
    // before this and is now the same constant.
    const patterns = route.split("UUID_PATTERN").length - 1;
    expect(patterns).toBeGreaterThanOrEqual(3);
  });
});

describe("public chat route: deterministic turns commit before they act", () => {
  it("persists before emitting actions on the deterministic path", () => {
    // This path knows its whole answer up front, so it can close the
    // stale-action race at the source rather than relying on the browser.
    const start = at("const persisted = visibleContent");
    const firstAction = route.indexOf(
      'sseEvent({ type: "action", action })',
      start,
    );
    expect(firstAction).toBeGreaterThan(start);
  });

  it("withholds the actions of a turn that lost the race", () => {
    const guard = at('const supersededByNewerTurn = persisted === "conflict"');
    const window = route.slice(guard, guard + 500);
    expect(window).toContain("if (!supersededByNewerTurn)");
  });

  it("still sends meta and the visible text when superseded", () => {
    // Only site mutation is withheld; a silent turn would be worse UI than a
    // turn whose answer simply does not move the page.
    const guard = at("const supersededByNewerTurn");
    const window = route.slice(guard, guard + 900);
    const meta = window.indexOf(
      "controller.enqueue(encoder.encode(metaEvent))",
    );
    const gate = window.indexOf("if (!supersededByNewerTurn)");
    expect(meta).toBeGreaterThan(-1);
    expect(meta).toBeLessThan(gate);
    expect(window).toContain("if (visibleContent)");
  });

  it("does not write memory twice on the deterministic path", () => {
    const deterministicReturnIndex = at(DETERMINISTIC_RETURN);
    const before = route.slice(0, deterministicReturnIndex);
    expect(before.split("persistTurnMemory({").length - 1).toBe(1);
  });
});

describe("public chat route: duplicate in-flight turns", () => {
  it("claims the turn before any expensive work", () => {
    // The whole point is to avoid paying for a second generation, so the
    // lease has to sit ahead of the model, the tools and the context loads.
    const claim = at("claimConversationTurn(memoryKey, clientRequestId)");
    expect(claim).toBeLessThan(at(CORPUS_QUERY));
    expect(claim).toBeLessThan(at(DETERMINISTIC_GUARD));
  });

  it("only claims when the id could actually be duplicated", () => {
    // A server-generated id is unique by construction; claiming it would cost
    // a round trip to prove something already true.
    const claim = at("const turnClaim =");
    expect(route.slice(claim, claim + 240)).toContain("clientRequestId");
  });

  it("returns without calling the model when the lease is held", () => {
    const guard = at("if (turnClaim && !turnClaim.granted)");
    const body = route.slice(
      guard,
      route.indexOf("}", route.indexOf("duplicateTurnResponse", guard)),
    );
    expect(body).toContain("duplicateTurnResponse");
    // The refusal must come before the state/model machinery, not after it.
    expect(guard).toBeLessThan(at("const stateResolvedAtMs"));
  });

  it("answers a duplicate with 200 and an explicit event, not an error status", () => {
    // 409/429 would make every existing client render "chat failed" for
    // something that is actually being answered.
    const responder = at("function duplicateTurnResponse(");
    const body = route.slice(responder, responder + 900);
    expect(body).toContain('sseEvent({ type: "duplicate" })');
    expect(body).toContain("text/event-stream");
    expect(body).not.toContain("status: 4");
  });

  it("emits no assistant text and no actions on the duplicate path", () => {
    const responder = at("function duplicateTurnResponse(");
    const body = route.slice(responder, responder + 900);
    expect(body).not.toContain('type: "action"');
    expect(body).not.toContain("delta");
  });

  it("records the duplicate as a turn that called no model", () => {
    const record = at('route: "duplicate"');
    expect(route.slice(record, record + 400)).toContain("model: null");
  });
});

describe("public chat route: degraded shared memory", () => {
  it("derives the degraded flag from the configured store, not from a guess", () => {
    expect(route).toContain(
      "const memoryDegraded = isConversationMemoryDegraded()",
    );
  });

  it("passes it to both reference resolvers", () => {
    // Ordinals and positional comparisons both resolve against a stored list.
    const reference = route.indexOf("resolveReferenceOutcome({");
    const compare = route.indexOf("resolveCompareOutcome({");
    expect(route.slice(reference, reference + 700)).toContain("memoryDegraded");
    expect(route.slice(compare, compare + 500)).toContain("memoryDegraded");
  });

  it("clears the reference ids, so a refusal is not contradicted by an action", () => {
    // stateActions builds a navigate-target straight from these ids. Refusing
    // in prose while still emitting the navigation would be the worst of both.
    const guard = at("if (memoryDegraded) {");
    const window = route.slice(guard, guard + 500);
    expect(window).toContain("stateOrdinalVehicleId = null");
    expect(window).toContain("stateSelectedVehicleId = null");
  });

  it("does not re-present a stored result set during an outage", () => {
    expect(route).toContain(
      "stateTransition.useStoredResultSet && memoryDegraded",
    );
  });

  it("reports the degraded state on every turn record", () => {
    // Three recording sites: the deterministic path, the shared model/tool
    // helper, and the duplicate refusal. A run of degraded turns is only
    // legible if every path reports it.
    const records =
      route.split("memoryDegraded: isConversationMemoryDegraded()").length - 1;
    expect(records).toBe(3);
  });
});

describe("public chat route: multi-call usage honesty", () => {
  it("declares that phase-1 counts cover only one of the tool path's two calls", () => {
    // The tool path makes two upstream calls; only the first reports usage.
    expect(route).toContain("coversCalls: 1");
    expect(route).toContain(
      'recordModelTurn({ route: "tool", emitted: emittedActions, calls: 2 })',
    );
  });

  it("still reports the prose path as a single call", () => {
    expect(route).toContain(
      'recordModelTurn({ route: "model", emitted: actions, calls: 1 })',
    );
  });
});

describe("public chat route: shadow interpretation is inert by default", () => {
  it("only runs where the deterministic layer already failed to resolve", () => {
    // The population the interpreter exists to improve. Running it on turns
    // the rules already answered would spend money to confirm agreement.
    const shadow = at("const shadowInterpretationScheduled =");
    expect(shadow).toBeGreaterThan(at(DETERMINISTIC_RETURN));
  });

  it("runs through the framework lifecycle after the response", () => {
    const shadow = at("after(async () =>");
    const window = route.slice(shadow, shadow + 1200);
    expect(window).toContain("runShadowInterpretation(shadowInput)");
    expect(window).toContain("recordChatInterpretationShadow");
  });

  it("does not await the experiment on the visitor response path", () => {
    expect(route).not.toContain("await shadowInterpretation");
    expect(route).toContain(
      "shadowModelCalls: shadowInterpretationScheduled ? 1 : 0",
    );
  });

  it("emits no action and writes no memory from the shadow path", () => {
    const shadow = at("after(async () =>");
    const window = route.slice(shadow, shadow + 1100);
    expect(window).not.toContain("persistTurnMemory");
    expect(window).not.toContain('type: "action"');
    expect(window).not.toContain("controller.enqueue");
  });

  it("counts shadow calls apart from the turn's own model calls", () => {
    // Folding them together would inflate every cost-per-answer figure the
    // moment the experiment is switched on.
    expect(route).toContain(
      "shadowModelCalls: shadowInterpretationScheduled ? 1 : 0",
    );
  });

  it("does not schedule shadow and active interpretation for the same tenant", () => {
    const schedule = at("const shadowInterpretationScheduled =");
    expect(route.slice(schedule, schedule + 220)).toContain(
      "!contextualInterpretationEnabled",
    );
  });

  it("logs field names and booleans, never the message or filter values", () => {
    const shadow = at("after(async () =>");
    const log = route.indexOf("recordChatInterpretationShadow({", shadow);
    expect(log).toBeGreaterThan(shadow);
    const window = route.slice(log, log + 600);
    expect(window).not.toContain("lastUser.content");
    expect(window).toContain("comparison: result.comparison");
    expect(observability).toContain("filterFieldsDiffering");
  });
});

describe("public chat route: active contextual interpretation", () => {
  it("runs only behind both rollout gates and only after deterministic extraction misses", () => {
    expect(route).toContain(
      "isResolvedContextualInterpretationEnabled(tenant.slug, chatProvider)",
    );
    const active = at("// Phase 3 active canary:");
    const window = route.slice(active, active + 1800);
    expect(window).toContain("contextualInterpretationEnabled");
    expect(window).toContain("!hasInventoryIntent");
    expect(active).toBeGreaterThan(
      at("extractVehicleFilters(lastUser.content"),
    );
  });

  it("compiles accepted meaning into deterministic inputs rather than actions", () => {
    const active = at("const compiled = activeInterpretationResult.candidate");
    const window = route.slice(active, active + 850);
    expect(window).toContain("compileChatInterpretation");
    expect(window).toContain("deterministicUserText = compiled.userText");
    expect(window).toContain("extractedFilters = compiled.filters");
    expect(window).not.toContain('type: "action"');
    expect(
      at(
        "transitionInventoryState(\n      conversationState,\n      deterministicUserText",
      ),
    ).toBeGreaterThan(active);
  });

  it("falls through unchanged when a candidate is absent or cannot be compiled", () => {
    const active = at("const compiled = activeInterpretationResult.candidate");
    const window = route.slice(active, active + 800);
    expect(window).toContain(": null");
    expect(window).toContain("if (compiled)");
  });

  it("marks interpreted deterministic turns and includes their model call", () => {
    expect(route).toContain(
      'source: activeInterpretationApplied ? "interpreted" : "deterministic"',
    );
    expect(route).toContain(
      'route: activeInterpretationApplied ? "interpreted" : "deterministic"',
    );
    expect(route).toContain("calls: 1");
  });
});

describe("deterministicSourceCategories", () => {
  it("claims vehicle provenance when a fresh query grounded the answer", () => {
    expect(
      deterministicSourceCategories({
        queriedInventory: true,
        groundedVehicleCount: 0,
      }),
    ).toEqual(["vehicles"]);
  });

  it("claims vehicle provenance when stored verified ids grounded the answer", () => {
    expect(
      deterministicSourceCategories({
        queriedInventory: false,
        groundedVehicleCount: 3,
      }),
    ).toEqual(["vehicles"]);
  });

  it("claims nothing when neither inventory nor a verified id was used", () => {
    // A clarifier ("which make did you mean?") is grounded in nothing, and
    // must not inherit a document category from a corpus this path never read.
    expect(
      deterministicSourceCategories({
        queriedInventory: false,
        groundedVehicleCount: 0,
      }),
    ).toEqual([]);
  });
});
