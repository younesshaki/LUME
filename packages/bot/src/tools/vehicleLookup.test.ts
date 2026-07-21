import { describe, expect, it } from "vitest";
import { runBotTool } from "../registry";
import { fakeGetVehicleById, fakeQueryVehicles, makeVehicle } from "../testFixtures";

const vehicles = [
  makeVehicle({ id: "a", make: "Porsche", model: "911", price: 120_000, mileage: 10_000, year: 2023 }),
  makeVehicle({ id: "b", make: "Porsche", model: "Cayman", price: 70_000, mileage: 30_000, year: 2021 }),
  makeVehicle({ id: "c", make: "BMW", model: "M4", price: 80_000, mileage: 15_000, year: 2022 }),
];

const fullCtx = () => ({
  tenantId: "tenant-1",
  queryVehicles: fakeQueryVehicles(vehicles).fn,
  getVehicleById: fakeGetVehicleById(vehicles),
});

describe("get_vehicle_details", () => {
  it("returns the vehicle and highlights it", async () => {
    const result = await runBotTool("get_vehicle_details", { vehicleId: "a" }, fullCtx());
    expect(result.ok).toBe(true);
    expect((result.data as { vehicle: { id: string } }).vehicle.id).toBe("a");
    expect(result.actions?.[0]).toEqual({ type: "highlight-vehicle", vehicleId: "a" });
  });

  it("returns a null vehicle when the id is unknown", async () => {
    const result = await runBotTool("get_vehicle_details", { vehicleId: "zzz" }, fullCtx());
    expect(result.ok).toBe(true);
    expect((result.data as { vehicle: unknown }).vehicle).toBeNull();
  });

  it("errors gracefully when the host did not wire getVehicleById", async () => {
    const result = await runBotTool("get_vehicle_details", { vehicleId: "a" }, {
      tenantId: "tenant-1",
      queryVehicles: fakeQueryVehicles(vehicles).fn,
    });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("execution_error");
  });
});

describe("compare_vehicles", () => {
  it("rejects fewer than two ids at the schema level", async () => {
    const result = await runBotTool("compare_vehicles", { vehicleIds: ["a"] }, fullCtx());
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_args");
  });

  it("compares vehicles and opens the grounded side-by-side comparison", async () => {
    const result = await runBotTool("compare_vehicles", { vehicleIds: ["a", "b", "c"] }, fullCtx());
    expect(result.ok).toBe(true);
    const data = result.data as {
      comparisons: Array<{ vehicleId: string; score: number }>;
      bestValueVehicleId: string;
    };
    expect(data.comparisons).toHaveLength(3);
    // 'c' sits at the median on both price and mileage, so it scores neutral;
    // 'a' is penalised for price and 'b' for high mileage — 'c' wins on balance.
    expect(data.bestValueVehicleId).toBe("c");
    expect(result.actions?.[0]).toEqual({
      type: "compare_vehicles",
      vehicleIds: ["c", "a", "b"],
    });
  });

  it("returns an empty comparison when fewer than two ids resolve", async () => {
    const result = await runBotTool("compare_vehicles", { vehicleIds: ["a", "zzz"] }, fullCtx());
    expect(result.ok).toBe(true);
    expect((result.data as { comparisons: unknown[] }).comparisons).toHaveLength(0);
  });

});
