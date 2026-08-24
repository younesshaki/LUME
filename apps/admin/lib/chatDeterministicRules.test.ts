import { describe, expect, it } from "vitest";
import type { Vehicle } from "@lume/types";
import {
  resolveCompareOutcome,
  resolveInventoryOutcome,
  resolveReferenceOutcome,
} from "./chatDeterministicRules";
import {
  availabilityAnswerFromGroundedInventory,
  inventoryFilterAction,
  inventoryRecommendationAnswer,
  inventoryResultAnswer,
  isDirectInventoryPresentationRequest,
  isInventoryRecommendationRequest,
  zeroResultAnswer,
} from "./chatAnswers";

const vehicle = (overrides: Partial<Vehicle> = {}): Vehicle =>
  ({
    id: overrides.id ?? "v1",
    tenantId: "t1",
    year: 2022,
    make: "BMW",
    model: "X5",
    trim: null,
    price: 50_000,
    mileage: 30_000,
    bodyStyle: "SUV",
    drivetrain: "AWD",
    fuelType: "Gas",
    exteriorColor: null,
    interiorColor: null,
    transmission: null,
    vin: null,
    stockType: "Used",
    sellerCity: null,
    sellerState: null,
    status: "live",
    ...overrides,
  }) as Vehicle;

describe("resolveCompareOutcome", () => {
  it("refuses when there is no result list yet", () => {
    const outcome = resolveCompareOutcome({
      compareIndexes: [0, 1],
      orderedIds: [],
      fetched: [],
      activeFilters: {},
    });
    expect(outcome.kind).toBe("unavailable");
    expect(outcome.answer).toContain("don’t have a current result list");
  });

  it("names the real list size when an index is out of range", () => {
    const outcome = resolveCompareOutcome({
      compareIndexes: [0, 4],
      orderedIds: ["a", "b"],
      fetched: [],
      activeFilters: {},
    });
    expect(outcome.kind).toBe("unavailable");
    expect(outcome.answer).toContain("has 2 results");
  });

  it("compares when both resolve and satisfy the filters", () => {
    const outcome = resolveCompareOutcome({
      compareIndexes: [0, 1],
      orderedIds: ["a", "b"],
      fetched: [vehicle({ id: "a" }), vehicle({ id: "b", price: 60_000 })],
      activeFilters: { make: "BMW" },
    });
    expect(outcome.kind).toBe("compared");
    expect(outcome.kind === "compared" && outcome.groundedVehicleIds).toEqual(["a", "b"]);
  });

  it("refuses when one id no longer resolves", () => {
    // A partial fetch cannot produce a truthful side-by-side, so it is treated
    // exactly like a filter mismatch rather than comparing what came back.
    const outcome = resolveCompareOutcome({
      compareIndexes: [0, 1],
      orderedIds: ["a", "b"],
      fetched: [vehicle({ id: "a" }), null],
      activeFilters: {},
    });
    expect(outcome.kind).toBe("unavailable");
    expect(outcome.answer).toContain("no longer satisfy");
  });

  it("refuses when a fetched vehicle falls outside the active filters", () => {
    const outcome = resolveCompareOutcome({
      compareIndexes: [0, 1],
      orderedIds: ["a", "b"],
      fetched: [vehicle({ id: "a" }), vehicle({ id: "b", make: "Mazda" })],
      activeFilters: { make: "BMW" },
    });
    expect(outcome.kind).toBe("unavailable");
  });
});

describe("resolveReferenceOutcome", () => {
  const base = {
    userText: "open the second one",
    referencedVehicleId: null as string | null,
    fetched: null as Vehicle | null,
    activeFilters: {},
    resultSet: null,
    hasOrdinalOrSelectionPhrase: false,
  };

  it("does nothing when the turn holds no reference", () => {
    expect(resolveReferenceOutcome({ ...base, userText: "hello" }).kind).toBe("none");
  });

  it("resolves a reference that still satisfies the filters", () => {
    const outcome = resolveReferenceOutcome({
      ...base,
      userText: "tell me about the second one",
      referencedVehicleId: "v1",
      fetched: vehicle(),
      activeFilters: { make: "BMW" },
    });
    expect(outcome.kind).toBe("resolved");
    expect(outcome.kind === "resolved" && outcome.answer).toContain("second result is");
  });

  it("suppresses prose on an action request, letting the action carry the turn", () => {
    const outcome = resolveReferenceOutcome({
      ...base,
      userText: "take me to the second one",
      referencedVehicleId: "v1",
      fetched: vehicle(),
      activeFilters: {},
    });
    expect(outcome.kind).toBe("resolved");
    expect(outcome.kind === "resolved" && outcome.answer).toBeNull();
  });

  it("refuses a reference the active filters have excluded", () => {
    const outcome = resolveReferenceOutcome({
      ...base,
      referencedVehicleId: "v1",
      fetched: vehicle({ make: "Mazda" }),
      activeFilters: { make: "BMW" },
    });
    expect(outcome.kind).toBe("unavailable");
    expect(outcome.answer).toContain("no longer satisfies");
  });

  it("refuses when the id could not be fetched at all", () => {
    const outcome = resolveReferenceOutcome({
      ...base,
      referencedVehicleId: "v1",
      fetched: null,
    });
    expect(outcome.kind).toBe("unavailable");
  });

  it("explains when there is no list to resolve against", () => {
    const outcome = resolveReferenceOutcome({
      ...base,
      hasOrdinalOrSelectionPhrase: true,
    });
    expect(outcome.kind).toBe("unavailable");
    expect(outcome.answer).toContain("don’t have a current result list");
  });
});

/**
 * Verbatim transcription of the inline logic this replaced, taken from the
 * route before extraction. The differential test below is the actual proof
 * that 3.1b changed no behaviour; the unit tests above only describe it.
 */
function originalInventoryLogic(input: {
  userText: string;
  filters: Record<string, unknown>;
  matchedVehicles: readonly Vehicle[];
  totalMatched: number;
  hasPriorResultSet: boolean;
  fullInventoryResetRequested: boolean;
}) {
  const { userText, filters, matchedVehicles, totalMatched } = input;
  let zeroResult: string | null = null;
  let inventory: string | null = null;
  let filterAction: unknown = null;
  let rollBack = false;

  if (totalMatched === 0 && input.hasPriorResultSet) {
    rollBack = true;
    zeroResult = zeroResultAnswer(filters as never);
  }
  const availability = availabilityAnswerFromGroundedInventory(
    userText,
    filters as never,
    matchedVehicles,
    totalMatched,
  );
  if (input.fullInventoryResetRequested) {
    inventory = inventoryResultAnswer(matchedVehicles, totalMatched);
    filterAction = inventoryFilterAction(filters as never);
  } else if (
    !availability &&
    totalMatched > 0 &&
    (isDirectInventoryPresentationRequest(userText, filters as never) ||
      isInventoryRecommendationRequest(userText))
  ) {
    inventory = isInventoryRecommendationRequest(userText)
      ? inventoryRecommendationAnswer(matchedVehicles, totalMatched)
      : inventoryResultAnswer(matchedVehicles, totalMatched);
    filterAction = inventoryFilterAction(filters as never);
  }
  return { zeroResult, availability, inventory, filterAction, rollBack };
}

describe("resolveInventoryOutcome", () => {
  const TEXTS = [
    "show me BMWs",
    "do you have any BMWs",
    "recommend one for me",
    "what SUVs do you have",
    "show me everything",
    "clear all filters",
    "hello there",
    "which one should I pick",
    "find cars under 30k",
  ];
  const FILTER_SETS = [
    {},
    { make: "BMW" },
    { make: "BMW", bodyStyle: "SUV" },
    { priceMax: 30_000 },
    { make: "Mazda", model: "CX-5", year: 2022 },
    { drivetrain: "AWD", fuelType: "Gas", priceMin: 10_000, priceMax: 90_000 },
  ];

  it("matches the original inline logic across every combination", () => {
    let compared = 0;
    for (const userText of TEXTS) {
      for (const filters of FILTER_SETS) {
        for (const totalMatched of [0, 1, 5, 200]) {
          for (const hasPriorResultSet of [true, false]) {
            for (const fullInventoryResetRequested of [true, false]) {
              const matchedVehicles =
                totalMatched === 0
                  ? []
                  : [vehicle({ id: "a" }), vehicle({ id: "b", price: 61_000 })];
              const args = {
                userText,
                filters,
                matchedVehicles,
                totalMatched,
                hasPriorResultSet,
                fullInventoryResetRequested,
              };
              const next = resolveInventoryOutcome(args as never);
              const prev = originalInventoryLogic(args);

              expect(next.zeroResult).toEqual(prev.zeroResult);
              expect(next.availability).toEqual(prev.availability);
              expect(next.inventory).toEqual(prev.inventory);
              expect(next.filterAction).toEqual(prev.filterAction);
              expect(next.rollBackToPreviousFilters).toEqual(prev.rollBack);
              compared++;
            }
          }
        }
      }
    }
    // 9 texts x 6 filter sets x 4 counts x 2 x 2
    expect(compared).toBe(864);
  });

  it("rolls back and names the dead constraints on a zero-result refinement", () => {
    const outcome = resolveInventoryOutcome({
      userText: "show me BMW SUVs under 20000",
      filters: { make: "BMW", bodyStyle: "SUV", priceMax: 20_000 },
      matchedVehicles: [],
      totalMatched: 0,
      hasPriorResultSet: true,
      fullInventoryResetRequested: false,
    });
    expect(outcome.rollBackToPreviousFilters).toBe(true);
    expect(outcome.zeroResult).toContain("BMW");
    expect(outcome.zeroResult).toContain("kept your previous results");
  });

  it("does not roll back a genuinely empty first search", () => {
    // No prior result set means there is nothing to preserve; this is a plain
    // empty search, not a refinement that destroyed a good one.
    const outcome = resolveInventoryOutcome({
      userText: "show me Ferraris",
      filters: { make: "Ferrari" },
      matchedVehicles: [],
      totalMatched: 0,
      hasPriorResultSet: false,
      fullInventoryResetRequested: false,
    });
    expect(outcome.rollBackToPreviousFilters).toBe(false);
    expect(outcome.zeroResult).toBeNull();
  });

  it("PINNED DEFECT (1.8): a zero-result reset still emits the dead filter action", () => {
    // The visitor is told "I've kept your previous results in place" while the
    // UI is filtered to the combination that matched nothing. Preserved here so
    // the extraction is provably behaviour-preserving; fixed in its own commit,
    // at which point this expectation flips to toBeNull().
    const outcome = resolveInventoryOutcome({
      userText: "clear all filters",
      filters: { make: "BMW", priceMax: 1 },
      matchedVehicles: [],
      totalMatched: 0,
      hasPriorResultSet: true,
      fullInventoryResetRequested: true,
    });
    expect(outcome.zeroResult).not.toBeNull();
    expect(outcome.filterAction).not.toBeNull();
  });
});
