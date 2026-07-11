import { describe, expect, it } from "vitest";
import {
  buildVehiclePriceSeries,
  countRecentPriceReductions,
  vehiclePriceSparklinePoints,
} from "./priceHistory";

const changes = [
  { oldPrice: 50_000, newPrice: 48_000, changedAt: "2026-06-20T00:00:00.000Z" },
  { oldPrice: 48_000, newPrice: 49_000, changedAt: "2026-07-01T00:00:00.000Z" },
  { oldPrice: 49_000, newPrice: 47_000, changedAt: "2026-07-05T00:00:00.000Z" },
];

describe("vehicle price history", () => {
  it("builds a chronological series beginning with the first previous price", () => {
    expect(buildVehiclePriceSeries([...changes].reverse(), 47_000).map((point) => point.price))
      .toEqual([50_000, 48_000, 49_000, 47_000]);
    expect(buildVehiclePriceSeries([], 10_000)[0]?.price).toBe(10_000);
  });

  it("maps flat and changing series into bounded sparkline coordinates", () => {
    expect(vehiclePriceSparklinePoints([
      { price: 100, changedAt: "a" },
      { price: 100, changedAt: "b" },
    ], 100, 40, 10)).toBe("10,10 90,10");
    expect(vehiclePriceSparklinePoints([
      { price: 100, changedAt: "a" },
      { price: 200, changedAt: "b" },
    ], 100, 40, 10)).toBe("10,30 90,10");
  });

  it("counts only reductions inside the requested past window", () => {
    expect(countRecentPriceReductions(
      changes,
      new Date("2026-07-11T00:00:00.000Z"),
      30,
    )).toBe(2);
    expect(countRecentPriceReductions(
      changes,
      new Date("2026-08-11T00:00:00.000Z"),
      30,
    )).toBe(0);
  });
});
