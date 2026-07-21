import { describe, expect, it } from "vitest";
import { buildVehicleQuery, findVehiclesSchema } from "./findVehicles";

describe("buildVehicleQuery", () => {
  it("maps provided args and defaults sort to 'recommended'", () => {
    const args = findVehiclesSchema.parse({ make: "Porsche", priceMax: 120_000 });
    const query = buildVehicleQuery(args);
    expect(query).toMatchObject({
      make: "Porsche",
      priceMax: 120_000,
      sort: "recommended",
      limit: 12,
    });
  });

  it("omits unset filters rather than sending undefined", () => {
    const args = findVehiclesSchema.parse({ make: "BMW" });
    const query = buildVehicleQuery(args);
    expect("model" in query).toBe(false);
    expect("priceMin" in query).toBe(false);
    expect(query.make).toBe("BMW");
  });

  it("passes through numeric bounds including zero", () => {
    const args = findVehiclesSchema.parse({ priceMin: 0, mileageMax: 0 });
    const query = buildVehicleQuery(args);
    expect(query.priceMin).toBe(0);
    expect(query.mileageMax).toBe(0);
  });

  it("passes through grounded listing location filters", () => {
    const query = buildVehicleQuery(
      findVehiclesSchema.parse({ sellerState: "FL", sellerCity: "Miami" }),
    );
    expect(query).toMatchObject({ sellerState: "FL", sellerCity: "Miami" });
  });

  it("rejects an out-of-range limit", () => {
    expect(() => findVehiclesSchema.parse({ limit: 999 })).toThrow();
  });
});
