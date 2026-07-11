import { describe, expect, it } from "vitest";
import {
  isVehicleStatusTransitionAllowed,
  normalizeVehicleStatusFilter,
  vehicleStatusFilterLabel,
} from "./vehicleStatus";

describe("vehicle status filters", () => {
  it("defaults missing and malformed filters to the non-archived inventory", () => {
    expect(normalizeVehicleStatusFilter(undefined)).toBe("active");
    expect(normalizeVehicleStatusFilter("bogus")).toBe("active");
  });

  it("accepts lifecycle and aggregate filters", () => {
    for (const filter of ["active", "draft", "live", "sold", "archived", "all"]) {
      expect(normalizeVehicleStatusFilter(filter)).toBe(filter);
    }
    expect(vehicleStatusFilterLabel("archived")).toBe("Archived");
  });

  it("keeps a recorded sale terminal except for sold-to-archived", () => {
    expect(isVehicleStatusTransitionAllowed("sold", true, "archived")).toBe(true);
    expect(isVehicleStatusTransitionAllowed("sold", true, "live")).toBe(false);
    expect(isVehicleStatusTransitionAllowed("archived", true, "sold")).toBe(false);
    expect(isVehicleStatusTransitionAllowed("archived", false, "live")).toBe(true);
  });
});
