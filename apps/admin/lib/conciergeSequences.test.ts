import { describe, expect, it } from "vitest";
import type { BotAction, Vehicle } from "@lume/types";
import type { VehicleQueryFilters } from "@lume/rag";
import {
  emptyConversationInventoryState,
  hasFullInventoryResetIntent,
  preserveResultSetForZeroResults,
  setConversationResultSet,
  transitionInventoryState,
  type ConversationInventoryState,
} from "./chatConversationState";
import {
  resolveInventoryOutcome,
  resolveReferenceOutcome,
} from "./chatDeterministicRules";
import { conversationMemoryKey } from "./conversationMemory.server";
import {
  normalizeAdminConciergeState,
  resolveAdminPresentationRequest,
  resultSetState,
  selectAdminConciergeResult,
} from "./adminConciergeState";

/**
 * Multi-turn regression harness.
 *
 * Every concierge bug in the 2026-07 series was a *sequence* bug: each rule
 * was correct in isolation and wrong three turns later. Per-function tests
 * cannot see those, so this drives scripted conversations through the same
 * state machine the route uses and asserts on what the visitor would end up
 * seeing.
 *
 * The catalog below is a fixture and `matchFixture` is written independently
 * of production filtering, so a bug in extraction or matching cannot make a
 * test agree with itself. No live inventory count is asserted anywhere: those
 * are historical observations, not invariants.
 */
const CATALOG: Vehicle[] = [
  fixture({ id: "bmw-x5", make: "BMW", model: "X5", price: 62_000, year: 2022, bodyStyle: "SUV" }),
  fixture({ id: "bmw-x3", make: "BMW", model: "X3", price: 48_000, year: 2021, bodyStyle: "SUV" }),
  fixture({ id: "camry-1", make: "Toyota", model: "Camry", price: 31_000, year: 2026, bodyStyle: "Sedan" }),
  fixture({ id: "camry-2", make: "Toyota", model: "Camry", price: 28_500, year: 2026, bodyStyle: "Sedan" }),
  fixture({ id: "civic-1", make: "Honda", model: "Civic", price: 18_000, year: 2020, bodyStyle: "Sedan" }),
];

function fixture(over: Partial<Vehicle> & { id: string }): Vehicle {
  return {
    tenantId: "t1",
    stockType: "Used",
    year: 2022,
    make: "BMW",
    model: "X5",
    trim: "",
    price: 50_000,
    mileage: 20_000,
    bodyStyle: "SUV",
    exteriorColor: "Black",
    interiorColor: "Black",
    drivetrain: "AWD",
    fuelType: "Gas",
    imageSrc: "",
    sellerCity: "Austin",
    sellerState: "TX",
    isSpecial: false,
    status: "live",
    soldAt: null,
    soldPrice: null,
    ...over,
  } as Vehicle;
}

/** Deliberately independent of production filter code. */
function matchFixture(filters: VehicleQueryFilters): Vehicle[] {
  return CATALOG.filter((vehicle) => {
    if (filters.make && vehicle.make.toLowerCase() !== filters.make.toLowerCase()) return false;
    if (filters.model && !vehicle.model.toLowerCase().includes(filters.model.toLowerCase())) return false;
    if (filters.bodyStyle && vehicle.bodyStyle.toLowerCase() !== filters.bodyStyle.toLowerCase()) return false;
    if (filters.year !== undefined && vehicle.year !== filters.year) return false;
    if (filters.priceMax !== undefined && vehicle.price > filters.priceMax) return false;
    if (filters.priceMin !== undefined && vehicle.price < filters.priceMin) return false;
    return true;
  });
}

type Turn = {
  text: string;
  /** What extraction would produce; supplied so the test is not testing it. */
  filters: VehicleQueryFilters;
  hasInventoryIntent?: boolean;
};

type TurnResult = {
  state: ConversationInventoryState;
  matched: Vehicle[];
  answer: string | null;
  action: BotAction | null;
  usedStoredResultSet: boolean;
};

/** Run one turn exactly as the route sequences it. */
function runTurn(
  state: ConversationInventoryState,
  turn: Turn,
  nowMs: number,
): TurnResult {
  const before = state;
  const transition = transitionInventoryState(
    state,
    turn.text,
    turn.filters,
    turn.hasInventoryIntent ?? true,
    { nowMs },
  );
  let next = transition.state;

  if (transition.useStoredResultSet) {
    return {
      state: next,
      matched: [],
      answer: null,
      action: { type: "filter_inventory", filters: next.activeFilters } as BotAction,
      usedStoredResultSet: true,
    };
  }
  if (!transition.shouldQuery) {
    return { state: next, matched: [], answer: null, action: null, usedStoredResultSet: false };
  }

  const matched = matchFixture(next.activeFilters);
  const outcome = resolveInventoryOutcome({
    userText: turn.text,
    filters: next.activeFilters,
    matchedVehicles: matched,
    totalMatched: matched.length,
    hasPriorResultSet: next.resultSet !== null,
    // Same derivation the route uses, so the harness cannot accidentally
    // test a reset the production path would not recognise.
    fullInventoryResetRequested: hasFullInventoryResetIntent(turn.text),
  });

  next = outcome.rollBackToPreviousFilters
    ? preserveResultSetForZeroResults(next, before.activeFilters)
    : setConversationResultSet(next, matched, matched.length);

  return {
    state: next,
    matched,
    answer: outcome.zeroResult ?? outcome.availability ?? outcome.inventory,
    action: outcome.filterAction,
    usedStoredResultSet: false,
  };
}

function runSequence(turns: Turn[]): TurnResult[] {
  let state = emptyConversationInventoryState();
  const results: TurnResult[] = [];
  let now = Date.parse("2026-09-12T10:00:00.000Z");
  for (const turn of turns) {
    now += 30_000;
    const result = runTurn(state, turn, now);
    state = result.state;
    results.push(result);
  }
  return results;
}

describe("sequence: an explicit new search does not inherit the old one", () => {
  it("drops a price cap when the visitor names a different model", () => {
    // The 2026-07-23 failure: a $70k cap set six turns earlier silently
    // shrank an unrelated later search.
    const [, camry] = runSequence([
      { text: "BMWs under 70k", filters: { make: "BMW", priceMax: 70_000 } },
      { text: "2026 Camry", filters: { make: "Toyota", model: "Camry", year: 2026 } },
    ]);
    expect(camry!.state.activeFilters.priceMax).toBeUndefined();
    expect(camry!.matched.map((v) => v.id)).toEqual(["camry-1", "camry-2"]);
  });

  it("drops a stale model and year when the make changes", () => {
    // "Cadillac Camry" and "2026 BMW" both shipped as real zero-result bugs.
    const [, , honda] = runSequence([
      { text: "2026 Camry", filters: { make: "Toyota", model: "Camry", year: 2026 } },
      { text: "any BMWs?", filters: { make: "BMW" } },
      { text: "what about Honda", filters: { make: "Honda" } },
    ]);
    expect(honda!.state.activeFilters.model).toBeUndefined();
    expect(honda!.state.activeFilters.year).toBeUndefined();
    expect(honda!.matched.map((v) => v.id)).toEqual(["civic-1"]);
  });

  it("keeps a refinement scoped to the current search", () => {
    const [, refined] = runSequence([
      { text: "BMWs", filters: { make: "BMW" } },
      { text: "under 50k", filters: { priceMax: 50_000 } },
    ]);
    expect(refined!.state.activeFilters.make).toBe("BMW");
    expect(refined!.matched.map((v) => v.id)).toEqual(["bmw-x3"]);
  });
});

describe("sequence: a full reset actually resets", () => {
  it("clears every facet, not just make and model", () => {
    // "no filters" once left a $70k cap in place, so "the whole inventory"
    // came back smaller than the inventory.
    const [, , reset] = runSequence([
      { text: "BMW SUVs under 70k", filters: { make: "BMW", bodyStyle: "SUV", priceMax: 70_000 } },
      { text: "only 2021", filters: { year: 2021 } },
      { text: "show me all inventory, no filters", filters: {} },
    ]);
    expect(reset!.state.activeFilters).toEqual({});
    expect(reset!.matched).toHaveLength(CATALOG.length);
  });

  it("emits a filter action so the grid and URL follow the reset", () => {
    // A reset that only changed the prose left the visitor looking at a
    // filtered grid while being told the filters were gone.
    const [, reset] = runSequence([
      { text: "BMWs", filters: { make: "BMW" } },
      { text: "back to the whole inventory", filters: {} },
    ]);
    expect(reset!.action).not.toBeNull();
    expect(reset!.action?.type).toBe("filter_inventory");
  });
});

describe("sequence: presentation requests always say something", () => {
  it("re-presents the stored list with an action rather than an empty reply", () => {
    // The blank-message bug: a stored-result "show me" reached the response
    // path with neither prose nor an action.
    const [, present] = runSequence([
      { text: "BMWs", filters: { make: "BMW" } },
      { text: "show me", filters: {}, hasInventoryIntent: true },
    ]);
    expect(present!.usedStoredResultSet).toBe(true);
    expect(present!.action).not.toBeNull();
  });

  it("keeps the stored order stable across a presentation turn", () => {
    const [search, present] = runSequence([
      { text: "BMWs", filters: { make: "BMW" } },
      { text: "show me", filters: {} },
    ]);
    expect(present!.state.resultSet?.orderedIds).toEqual(
      search!.state.resultSet?.orderedIds,
    );
  });
});

describe("sequence: ordinals resolve against the verified list", () => {
  it("opens the vehicle at the stored position, not a re-query", () => {
    const [search] = runSequence([{ text: "BMWs", filters: { make: "BMW" } }]);
    const ordered = search!.state.resultSet!.orderedIds;
    const second = CATALOG.find((v) => v.id === ordered[1])!;
    const outcome = resolveReferenceOutcome({
      userText: "open the second one",
      referencedVehicleId: ordered[1]!,
      fetched: second,
      activeFilters: search!.state.activeFilters,
      resultSet: search!.state.resultSet,
      hasOrdinalOrSelectionPhrase: true,
      attemptedZeroResult: search!.state.attemptedZeroResult,
    });
    expect(outcome.kind).toBe("resolved");
    expect(outcome.kind === "resolved" && outcome.vehicle.id).toBe(ordered[1]);
  });

  it("refuses a position beyond the stored list instead of guessing", () => {
    const [search] = runSequence([{ text: "BMWs", filters: { make: "BMW" } }]);
    const outcome = resolveReferenceOutcome({
      userText: "open the ninth one",
      referencedVehicleId: null,
      fetched: null,
      activeFilters: search!.state.activeFilters,
      resultSet: search!.state.resultSet,
      hasOrdinalOrSelectionPhrase: true,
    });
    expect(outcome.kind).toBe("unavailable");
  });
});

describe("sequence: a zero-result refinement cannot trap or mislead", () => {
  const zeroSequence = () =>
    runSequence([
      { text: "BMWs", filters: { make: "BMW" } },
      { text: "under 20k", filters: { priceMax: 20_000 } },
    ]);

  it("reports the zero and rolls the filters back", () => {
    const [, zero] = zeroSequence();
    expect(zero!.matched).toHaveLength(0);
    expect(zero!.answer).toContain("under $20,000");
    expect(zero!.state.activeFilters).toEqual({ make: "BMW" });
  });

  it("does not compound the dead facet into the next search", () => {
    const results = runSequence([
      { text: "BMWs", filters: { make: "BMW" } },
      { text: "under 20k", filters: { priceMax: 20_000 } },
      { text: "BMWs again", filters: { make: "BMW" } },
    ]);
    expect(results[2]!.matched.map((v) => v.id)).toEqual(["bmw-x5", "bmw-x3"]);
  });

  it("will not open a previous result that the failed constraint excluded", () => {
    const [, zero] = zeroSequence();
    const first = CATALOG.find((v) => v.id === zero!.state.resultSet!.orderedIds[0])!;
    const outcome = resolveReferenceOutcome({
      userText: "open the first one",
      referencedVehicleId: first.id,
      fetched: first,
      activeFilters: zero!.state.activeFilters,
      resultSet: zero!.state.resultSet,
      hasOrdinalOrSelectionPhrase: true,
      attemptedZeroResult: zero!.state.attemptedZeroResult,
    });
    expect(outcome.kind).toBe("unavailable");
  });
});

describe("isolation: conversation keys cannot collide", () => {
  it("gives two anonymous sessions of one tenant different namespaces", () => {
    const a = conversationMemoryKey("tenant-1", "anonymous:session-a");
    const b = conversationMemoryKey("tenant-1", "anonymous:session-b");
    expect(a).not.toBe(b);
  });

  it("gives the same visitor id in two tenants different namespaces", () => {
    expect(conversationMemoryKey("tenant-1", "visitor-1")).not.toBe(
      conversationMemoryKey("tenant-2", "visitor-1"),
    );
  });

  it("does not leak the tenant or visitor id into the key", () => {
    const key = conversationMemoryKey("tenant-secret", "visitor-secret");
    expect(key).not.toContain("tenant-secret");
    expect(key).not.toContain("visitor-secret");
  });
});

describe("admin: result-set references stay inside the stored set", () => {
  const NOW = Date.parse("2026-09-12T10:00:00.000Z");
  // Ids must be UUIDs: normalizeAdminConciergeState drops anything else, so a
  // client-invented handle cannot enter the result set in the first place.
  const LEAD_1 = "11111111-1111-4111-8111-111111111111";
  const LEAD_2 = "22222222-2222-4222-8222-222222222222";
  const FOREIGN = "33333333-3333-4333-8333-333333333333";
  const state = resultSetState(
    {
      kind: "leads",
      orderedIds: [LEAD_1, LEAD_2],
      totalCount: 2,
      href: "/admin/acme/leads",
    },
    NOW,
  );

  it("resolves an ordinal to the stored id, never a fresh query", () => {
    expect(resolveAdminPresentationRequest("open the second one", state)).toEqual({
      kind: "open_result",
      id: LEAD_2,
      resultKind: "leads",
    });
  });

  it("refuses a position beyond the stored set", () => {
    expect(resolveAdminPresentationRequest("open the fifth one", state)).toBeNull();
  });

  it("refuses to select an id the server never issued", () => {
    // The cross-tenant shape: a client-supplied id that is not in this
    // actor's own result set must not become a selection.
    const attempted = selectAdminConciergeResult(
      state,
      FOREIGN,
      "leads",
    );
    expect(attempted.selected).toBeNull();
  });

  it("refuses a selection whose kind does not match the stored set", () => {
    const attempted = selectAdminConciergeResult(state, LEAD_1, "vehicles");
    expect(attempted.selected).toBeNull();
  });

  it("accepts a selection that is genuinely in the stored set", () => {
    expect(selectAdminConciergeResult(state, LEAD_1, "leads").selected).toEqual({
      id: LEAD_1,
      kind: "leads",
    });
  });

  it("drops non-UUID ids, so a client-invented handle cannot enter the set", () => {
    const restored = normalizeAdminConciergeState(
      {
        lastResultSet: {
          kind: "leads",
          orderedIds: ["lead-1", "../../admin/platform", LEAD_1],
          totalCount: 3,
          href: "/admin/acme/leads",
          createdAt: new Date(NOW).toISOString(),
        },
        selected: null,
      },
      NOW,
    );
    expect(restored.lastResultSet?.orderedIds).toEqual([LEAD_1]);
  });

  it("rejects a result set whose href leaves the admin surface", () => {
    const restored = normalizeAdminConciergeState(
      {
        lastResultSet: {
          kind: "leads",
          orderedIds: [LEAD_1],
          totalCount: 1,
          href: "https://example.com/steal",
          createdAt: new Date(NOW).toISOString(),
        },
        selected: null,
      },
      NOW,
    );
    expect(restored.lastResultSet).toBeNull();
  });

  it("expires a stale result set rather than resolving against it", () => {
    // The set is server-owned and short-lived; resolving "the second one"
    // against an hour-old list would open whatever has since shifted position.
    const restored = normalizeAdminConciergeState(
      {
        lastResultSet: {
          kind: "leads",
          orderedIds: [LEAD_1],
          totalCount: 1,
          href: "/admin/acme/leads",
          createdAt: new Date(NOW - 60 * 60 * 1_000).toISOString(),
        },
        selected: null,
      },
      NOW,
    );
    expect(restored.lastResultSet).toBeNull();
    expect(resolveAdminPresentationRequest("open the first one", restored)).toBeNull();
  });
});
