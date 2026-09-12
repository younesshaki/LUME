import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { deterministicSourceCategories } from "./chatAnswers";

const route = readFileSync(
  resolve(process.cwd(), "apps/admin/app/api/chat/route.ts"),
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
const DETERMINISTIC_RETURN = "return new Response(stream, { headers: sseHeaders });";
const CORPUS_QUERY = '.from("rag_chunks")';
const FACETS_RPC = 'supabase.rpc("vehicle_facets_v2"';
const LOYALTY_CALL = "loadChatLoyaltyContext(supabase";
const PREFERENCES_CALL = "loadVisitorPreferenceContext(supabase";
const IMAGE_DESCRIPTIONS = '.from("vehicle_images")';
const SELECTED_VEHICLE_FETCH = "getTenantVehicle(supabase, tenant.tenantId, selectedVehicleCandidate)";
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
    const deterministic = route.indexOf('route: "deterministic"');
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

  it("reports the deterministic path as having called no model", () => {
    const index = at('route: "deterministic"');
    const window = route.slice(index, index + 900);
    expect(window).toContain("model: null");
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
