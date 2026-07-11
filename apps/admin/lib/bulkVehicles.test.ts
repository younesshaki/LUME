import { describe, expect, it } from "vitest";
import {
  calculateBulkVehiclePrice,
  normalizeBulkPriceRule,
  normalizeSelectedVehicleIds,
  previewBulkVehiclePrices,
} from "./bulkVehicles";

const ID_1 = "11111111-1111-4111-8111-111111111111";
const ID_2 = "22222222-2222-4222-8222-222222222222";

describe("bulk vehicle selection", () => {
  it("trims and deduplicates valid IDs", () => {
    expect(normalizeSelectedVehicleIds([` ${ID_1} `, ID_1, ID_2])).toEqual({
      ids: [ID_1, ID_2],
      error: null,
    });
  });

  it("rejects empty and malformed selections", () => {
    expect(normalizeSelectedVehicleIds([]).error).toMatch(/at least one/i);
    expect(normalizeSelectedVehicleIds(["not-a-uuid"]).error).toMatch(/invalid/i);
  });
});

describe("bulk vehicle price rules", () => {
  it("supports percentage, fixed delta, and exact price rules", () => {
    expect(calculateBulkVehiclePrice(10_000, { kind: "percent", value: 5 })).toBe(10_500);
    expect(calculateBulkVehiclePrice(10_000, { kind: "fixed", value: -500 })).toBe(9_500);
    expect(calculateBulkVehiclePrice(10_000, { kind: "set", value: 8_999.6 })).toBe(9_000);
  });

  it("normalizes only bounded, meaningful rules", () => {
    expect(normalizeBulkPriceRule("percent", -100)).toBeNull();
    expect(normalizeBulkPriceRule("percent", 0)).toBeNull();
    expect(normalizeBulkPriceRule("fixed", Number.NaN)).toBeNull();
    expect(normalizeBulkPriceRule("set", -1)).toBeNull();
    expect(normalizeBulkPriceRule("percent", 5)).toEqual({ kind: "percent", value: 5 });
  });

  it("previews the exact affected count and projected range", () => {
    expect(previewBulkVehiclePrices(
      [{ price: 10_000 }, { price: 20_000 }],
      { kind: "percent", value: 10 },
    )).toEqual({
      affected: 2,
      minimum: 11_000,
      maximum: 22_000,
      totalBefore: 30_000,
      totalAfter: 33_000,
      error: null,
    });
  });

  it("rejects rules that would cross the positive integer price range", () => {
    expect(calculateBulkVehiclePrice(100, { kind: "fixed", value: -100 })).toBeNull();
    expect(previewBulkVehiclePrices([], { kind: "set", value: 100 }).error).toMatch(/select/i);
  });
});
