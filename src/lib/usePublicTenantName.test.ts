import { describe, expect, it } from "vitest";
import { houseOrTenantLabel, vehiclePageTitle } from "./usePublicTenantName";

describe("houseOrTenantLabel", () => {
  it("keeps LUME's concept copy on the house site only", () => {
    expect(houseOrTenantLabel("Marketplace Concept", "LUME", "default")).toBe("Marketplace Concept");
    expect(houseOrTenantLabel("Marketplace Concept", "Riviera Motors", "demo")).toBe("Riviera Motors");
  });

  it("shows nothing rather than LUME copy while a dealership's name is unknown", () => {
    expect(houseOrTenantLabel("Marketplace Concept", null, "demo")).toBe("");
  });
});

describe("vehiclePageTitle", () => {
  const car = { year: 2023, make: "Lamborghini", model: "Urus" };
  it("names the dealership, never 'LUME Marketplace'", () => {
    expect(vehiclePageTitle(car, "Riviera Motors")).toBe("2023 Lamborghini Urus · Riviera Motors");
  });
  it("falls back to the car alone", () => {
    expect(vehiclePageTitle(car, null)).toBe("2023 Lamborghini Urus");
  });
});
