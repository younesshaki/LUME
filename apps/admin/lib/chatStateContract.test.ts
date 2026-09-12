import { describe, expect, it } from "vitest";
import type { Vehicle } from "@lume/types";
import {
  CONVERSATION_STATE_SCHEMA_VERSION,
  emptyConversationInventoryState,
  normalizeConversationInventoryState,
  preserveResultSetForZeroResults,
  setConversationResultSet,
  transitionInventoryState,
} from "./chatConversationState";
import { resolveReferenceOutcome } from "./chatDeterministicRules";

const vehicle = (over: Partial<Vehicle> = {}): Vehicle =>
  ({
    id: "v1",
    tenantId: "t1",
    stockType: "Used",
    year: 2022,
    make: "BMW",
    model: "X5",
    trim: "xDrive40i",
    price: 62_000,
    mileage: 18_000,
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
  }) as Vehicle;

describe("conversation state: schema versioning", () => {
  it("stamps the current version on a fresh state", () => {
    expect(emptyConversationInventoryState().schemaVersion).toBe(
      CONVERSATION_STATE_SCHEMA_VERSION,
    );
  });

  it("reads pre-versioning state rather than discarding it", () => {
    // Sessions in flight at deploy time must not lose their scope.
    const legacy = normalizeConversationInventoryState({
      activeFilters: { make: "BMW" },
      resultSet: {
        orderedIds: ["a", "b"],
        totalCount: 2,
        filtersApplied: { make: "BMW" },
        createdAtTurn: 1,
      },
      selectedVehicleId: "a",
      turn: 3,
      lastInventoryActivityAt: "2026-09-12T10:00:00.000Z",
    });
    expect(legacy.activeFilters).toEqual({ make: "BMW" });
    expect(legacy.selectedVehicleId).toBe("a");
    expect(legacy.turn).toBe(3);
  });

  it("discards state written by a newer deployment", () => {
    // Acting on a scope encoded by rules this build does not implement is
    // exactly how a visitor gets results they cannot see the reason for.
    const future = normalizeConversationInventoryState({
      schemaVersion: CONVERSATION_STATE_SCHEMA_VERSION + 1,
      activeFilters: { make: "BMW", priceMax: 70_000 },
      turn: 9,
    });
    expect(future).toEqual(emptyConversationInventoryState());
  });

  it("recovers to an empty state from corrupt storage", () => {
    expect(normalizeConversationInventoryState("nonsense")).toEqual(
      emptyConversationInventoryState(),
    );
    expect(normalizeConversationInventoryState(null)).toEqual(
      emptyConversationInventoryState(),
    );
  });
});

describe("conversation state: attempted zero is distinct from previous results", () => {
  const priorFilters = { make: "BMW" as const };

  const zeroState = () => {
    const state = {
      ...emptyConversationInventoryState(),
      activeFilters: { make: "BMW", priceMax: 20_000 },
      resultSet: {
        orderedIds: ["v1", "v2"],
        totalCount: 2,
        filtersApplied: priorFilters,
        createdAtTurn: 1,
      },
      turn: 2,
    };
    return preserveResultSetForZeroResults(state, priorFilters);
  };

  it("still rolls the filters back, so a dead refinement cannot compound", () => {
    // The 2026-07-22 protection. Everything below must not weaken it.
    const state = zeroState();
    expect(state.activeFilters).toEqual(priorFilters);
    expect(state.resultSet?.orderedIds).toEqual(["v1", "v2"]);
  });

  it("records what the visitor actually asked for", () => {
    const state = zeroState();
    expect(state.attemptedZeroResult).toEqual({
      filters: { make: "BMW", priceMax: 20_000 },
      attemptedAtTurn: 2,
    });
  });

  it("refuses to open a previous result that the latest ask excluded", () => {
    // "under $20k" matched nothing; the $62k previous result is still on
    // screen. Opening it would act against the constraint just stated.
    const state = zeroState();
    const outcome = resolveReferenceOutcome({
      userText: "open the second one",
      referencedVehicleId: "v1",
      fetched: vehicle({ id: "v1", price: 62_000 }),
      activeFilters: state.activeFilters,
      resultSet: state.resultSet,
      hasOrdinalOrSelectionPhrase: true,
      attemptedZeroResult: state.attemptedZeroResult,
    });
    expect(outcome.kind).toBe("unavailable");
    expect(outcome.kind === "unavailable" && outcome.answer).toContain(
      "under $20,000",
    );
  });

  it("opens a previous result that does satisfy the failed constraint", () => {
    // Only the conflict is refused. A cheap car in the old list is still a
    // legitimate answer, and refusing it would be its own trap.
    const state = zeroState();
    const outcome = resolveReferenceOutcome({
      userText: "open the first one",
      referencedVehicleId: "v1",
      fetched: vehicle({ id: "v1", price: 15_000 }),
      activeFilters: state.activeFilters,
      resultSet: state.resultSet,
      hasOrdinalOrSelectionPhrase: true,
      attemptedZeroResult: state.attemptedZeroResult,
    });
    expect(outcome.kind).toBe("resolved");
  });

  it("behaves exactly as before when no zero was recorded", () => {
    const outcome = resolveReferenceOutcome({
      userText: "open the first one",
      referencedVehicleId: "v1",
      fetched: vehicle({ id: "v1", price: 62_000 }),
      activeFilters: { make: "BMW" },
      resultSet: {
        orderedIds: ["v1"],
        totalCount: 1,
        filtersApplied: { make: "BMW" },
        createdAtTurn: 1,
      },
      hasOrdinalOrSelectionPhrase: true,
    });
    expect(outcome.kind).toBe("resolved");
  });

  it("clears the zero once a later search returns matches", () => {
    const state = setConversationResultSet(zeroState(), [{ id: "v9" }], 1);
    expect(state.attemptedZeroResult).toBeNull();
  });

  it("clears the zero on a full inventory reset", () => {
    // "show me everything" replaces the failed ask; it must not keep
    // refusing to open results afterwards.
    const transition = transitionInventoryState(
      zeroState(),
      "show me all inventory",
      {},
      true,
      { nowMs: Date.parse("2026-09-12T10:05:00.000Z") },
    );
    expect(transition.state.attemptedZeroResult).toBeNull();
  });

  it("ignores a stored zero record that names no constraint", () => {
    // An empty record would block every reference without being able to say
    // why, so it is treated as absent.
    const normalized = normalizeConversationInventoryState({
      activeFilters: {},
      attemptedZeroResult: { filters: {}, attemptedAtTurn: 2 },
      turn: 2,
    });
    expect(normalized.attemptedZeroResult).toBeNull();
  });
});

describe("conversation state: retained preferences are separate from the search", () => {
  it("defaults to none, so nothing is retained implicitly", () => {
    // Product decision: filters are search-scoped unless explicitly retained.
    expect(emptyConversationInventoryState().retainedPreferences).toEqual({});
  });

  it("round-trips an explicitly retained preference through storage", () => {
    const restored = normalizeConversationInventoryState({
      activeFilters: { make: "Toyota" },
      retainedPreferences: { priceMax: 20_000 },
      turn: 1,
    });
    expect(restored.retainedPreferences).toEqual({ priceMax: 20_000 });
    expect(restored.activeFilters).toEqual({ make: "Toyota" });
  });

  it("does not let a search filter leak into retained preferences", () => {
    const state = transitionInventoryState(
      emptyConversationInventoryState(),
      "BMWs under 70k",
      { make: "BMW", priceMax: 70_000 },
      true,
      { nowMs: Date.now() },
    );
    expect(state.state.retainedPreferences).toEqual({});
  });
});

describe("conversation state: pending clarification", () => {
  it("round-trips a recognised clarification", () => {
    const restored = normalizeConversationInventoryState({
      pendingClarification: { kind: "make-switch", askedAtTurn: 4 },
      turn: 4,
    });
    expect(restored.pendingClarification).toEqual({
      kind: "make-switch",
      askedAtTurn: 4,
    });
  });

  it("drops an unrecognised clarification kind", () => {
    const restored = normalizeConversationInventoryState({
      pendingClarification: { kind: "something-else", askedAtTurn: 4 },
    });
    expect(restored.pendingClarification).toBeNull();
  });
});
