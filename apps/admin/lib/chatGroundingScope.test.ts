import { describe, expect, it } from "vitest";
import {
  introducesNewScopeDimension,
  shouldGroundSelectedVehicle,
  type GroundingScopeInput,
} from "./chatGroundingScope";

const base: GroundingScopeInput = {
  hasInventoryIntent: false,
  extractedFilters: {},
  activeFilters: {},
  isSelectedVehicleDetailRequest: false,
  isOrdinalReference: false,
  isSelectedVehicleAction: false,
};

describe("introducesNewScopeDimension", () => {
  it("sees a new make, model or body style", () => {
    expect(introducesNewScopeDimension({ make: "Mazda" }, { make: "BMW" })).toBe(true);
    expect(introducesNewScopeDimension({ bodyStyle: "SUV" }, { make: "BMW" })).toBe(true);
    expect(introducesNewScopeDimension({ model: "Camry" }, {})).toBe(true);
  });

  it("ignores a dimension the scope already has at the same value", () => {
    expect(introducesNewScopeDimension({ make: "BMW" }, { make: "BMW" })).toBe(false);
  });

  it("does not treat price or mileage as a new subject", () => {
    // "under $30k" after opening a BMW is plausibly still about BMWs. Treating
    // it as a fresh search would drop grounding the visitor still wants.
    expect(introducesNewScopeDimension({ priceMax: 30000 }, { make: "BMW" })).toBe(false);
    expect(introducesNewScopeDimension({ mileageMax: 50000 }, { make: "BMW" })).toBe(false);
  });

  it("is false for a turn that extracted nothing", () => {
    expect(introducesNewScopeDimension({}, { make: "BMW" })).toBe(false);
  });
});

describe("shouldGroundSelectedVehicle", () => {
  it("drops grounding on the reported scenario", () => {
    // Visitor opened a BMW, then asked about SUVs. The BMW description must
    // not lead the context block on that turn.
    expect(shouldGroundSelectedVehicle({
      ...base,
      hasInventoryIntent: true,
      extractedFilters: { bodyStyle: "SUV" },
      activeFilters: { make: "BMW" },
    })).toBe(false);
  });

  it("keeps grounding for a question about the open vehicle", () => {
    // The case the chunk exists for, including before navigation settles
    // pagePath. This must not regress.
    for (const flag of ["isSelectedVehicleDetailRequest", "isOrdinalReference", "isSelectedVehicleAction"] as const) {
      expect(shouldGroundSelectedVehicle({
        ...base,
        [flag]: true,
        // Even alongside a search-shaped turn, an explicit reference wins.
        hasInventoryIntent: true,
        extractedFilters: { bodyStyle: "SUV" },
        activeFilters: { make: "BMW" },
      }), flag).toBe(true);
    }
  });

  it("keeps grounding when the turn narrows without changing subject", () => {
    expect(shouldGroundSelectedVehicle({
      ...base,
      hasInventoryIntent: true,
      extractedFilters: { priceMax: 30000 },
      activeFilters: { make: "BMW" },
    })).toBe(true);
  });

  it("keeps grounding on a turn with no inventory intent at all", () => {
    // "what are your opening hours?" — nothing to do with scope.
    expect(shouldGroundSelectedVehicle({ ...base, hasInventoryIntent: false })).toBe(true);
  });

  it("keeps grounding when the visitor re-states the same make", () => {
    expect(shouldGroundSelectedVehicle({
      ...base,
      hasInventoryIntent: true,
      extractedFilters: { make: "BMW" },
      activeFilters: { make: "BMW" },
    })).toBe(true);
  });

  it("drops grounding when the visitor switches make outright", () => {
    expect(shouldGroundSelectedVehicle({
      ...base,
      hasInventoryIntent: true,
      extractedFilters: { make: "Mazda" },
      activeFilters: { make: "BMW" },
    })).toBe(false);
  });
});
