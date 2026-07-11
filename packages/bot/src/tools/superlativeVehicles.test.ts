import { describe, expect, it } from "vitest";
import type { BotToolContext, SuperlativeVehicle } from "../types";
import {
  findCheapest,
  findCheapestTool,
  findMostRecent,
  findMostRecentTool,
  findNewest,
} from "./superlativeVehicles";

function vehicle(
  id: string,
  overrides: Partial<Omit<SuperlativeVehicle, "id">> = {}
): SuperlativeVehicle {
  return {
    id,
    price: 50_000,
    year: 2024,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("superlative vehicle selectors", () => {
  it("finds the cheapest valid price without mutating input", () => {
    const vehicles = [
      vehicle("premium", { price: 120_000 }),
      vehicle("invalid", { price: null }),
      vehicle("value", { price: 42_000 }),
    ];
    const originalOrder = vehicles.map((item) => item.id);

    expect(findCheapest(vehicles)?.id).toBe("value");
    expect(vehicles.map((item) => item.id)).toEqual(originalOrder);
  });

  it("finds newest by model year, not listing date", () => {
    const vehicles = [
      vehicle("recent-listing", {
        year: 2022,
        createdAt: "2026-06-01T00:00:00.000Z",
      }),
      vehicle("new-model", {
        year: 2026,
        createdAt: "2025-01-01T00:00:00.000Z",
      }),
    ];

    expect(findNewest(vehicles)?.id).toBe("new-model");
    expect(findMostRecent(vehicles)?.id).toBe("recent-listing");
  });

  it("breaks equal metrics by ascending id deterministically", () => {
    const vehicles = [vehicle("zeta"), vehicle("alpha"), vehicle("middle")];

    expect(findCheapest(vehicles)?.id).toBe("alpha");
    expect(findNewest(vehicles)?.id).toBe("alpha");
    expect(findMostRecent(vehicles)?.id).toBe("alpha");
  });

  it("returns null for empty, null, and entirely invalid candidates", () => {
    expect(findCheapest([])).toBeNull();
    expect(findNewest(null)).toBeNull();
    expect(
      findMostRecent([
        vehicle("missing", { createdAt: null }),
        vehicle("invalid", { createdAt: "not-a-date" }),
      ])
    ).toBeNull();
  });
});

describe("superlative vehicle tools", () => {
  const context = (vehicles: SuperlativeVehicle[]): BotToolContext => ({
    tenantId: "tenant-1",
    queryVehicles: async () => ({ vehicles: [], totalCount: 0, hasMore: false }),
    getSuperlativeVehicles: async () => vehicles,
  });

  it("returns a callable result and highlight action", async () => {
    const result = await findCheapestTool.execute(
      {},
      context([vehicle("high", { price: 90_000 }), vehicle("low", { price: 40_000 })])
    );

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ vehicle: vehicle("low", { price: 40_000 }) });
    expect(result.actions).toEqual([{ type: "highlight-vehicle", vehicleId: "low" }]);
  });

  it("reports missing host wiring as a structured tool failure", async () => {
    const result = await findMostRecentTool.execute({}, {
      tenantId: "tenant-1",
      queryVehicles: async () => ({ vehicles: [], totalCount: 0, hasMore: false }),
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("execution_error");
  });
});
