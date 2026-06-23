import { describe, expect, it } from "vitest";
import { buildMarketContext, dealScore, rankByDealScore } from "./dealScore";
import { makeVehicle } from "./testFixtures";

describe("buildMarketContext", () => {
  it("computes median price and mileage", () => {
    const ctx = buildMarketContext(
      [
        makeVehicle({ price: 50_000, mileage: 10_000 }),
        makeVehicle({ price: 100_000, mileage: 20_000 }),
        makeVehicle({ price: 150_000, mileage: 30_000 }),
      ],
      2024
    );
    expect(ctx.medianPrice).toBe(100_000);
    expect(ctx.medianMileage).toBe(20_000);
    expect(ctx.currentYear).toBe(2024);
  });

  it("ignores vehicles with unknown mileage and returns null when none report it", () => {
    const ctx = buildMarketContext([
      makeVehicle({ price: 80_000, mileage: null }),
      makeVehicle({ price: 120_000, mileage: null }),
    ]);
    expect(ctx.medianPrice).toBe(100_000);
    expect(ctx.medianMileage).toBeNull();
  });

  it("handles an empty list without throwing", () => {
    const ctx = buildMarketContext([]);
    expect(ctx.medianPrice).toBe(0);
    expect(ctx.medianMileage).toBeNull();
  });
});

describe("dealScore", () => {
  const context = { medianPrice: 100_000, medianMileage: 20_000, currentYear: 2024 };

  it("scores a below-median price higher than an above-median price", () => {
    const cheap = dealScore(makeVehicle({ price: 70_000 }), context);
    const pricey = dealScore(makeVehicle({ price: 130_000 }), context);
    expect(cheap.score).toBeGreaterThan(pricey.score);
    expect(cheap.reasons.join(" ")).toMatch(/below comparable/i);
    expect(pricey.reasons.join(" ")).toMatch(/above comparable/i);
  });

  it("rewards lower mileage", () => {
    const low = dealScore(makeVehicle({ price: 100_000, mileage: 5_000 }), context);
    const high = dealScore(makeVehicle({ price: 100_000, mileage: 40_000 }), context);
    expect(low.score).toBeGreaterThan(high.score);
    expect(low.reasons.join(" ")).toMatch(/lower mileage/i);
  });

  it("clamps the score to the 0–100 range", () => {
    const extreme = dealScore(
      makeVehicle({ price: 1, mileage: 1, year: 2024 }),
      context
    );
    expect(extreme.score).toBeGreaterThanOrEqual(0);
    expect(extreme.score).toBeLessThanOrEqual(100);
  });

  it("gives a neutral-ish score at the median with no strong signals", () => {
    const atMedian = dealScore(makeVehicle({ price: 100_000, mileage: 20_000, year: 2022 }), context);
    expect(atMedian.score).toBeGreaterThan(40);
    expect(atMedian.score).toBeLessThan(60);
  });
});

describe("rankByDealScore", () => {
  it("orders best value first and breaks ties by lower price", () => {
    const ranked = rankByDealScore(
      [
        makeVehicle({ id: "expensive", price: 150_000, mileage: 20_000 }),
        makeVehicle({ id: "cheap", price: 60_000, mileage: 20_000 }),
        makeVehicle({ id: "mid", price: 100_000, mileage: 20_000 }),
      ],
      2024
    );
    expect(ranked[0].vehicle.id).toBe("cheap");
    expect(ranked[ranked.length - 1].vehicle.id).toBe("expensive");
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
  });
});
