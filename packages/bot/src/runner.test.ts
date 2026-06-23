import { describe, expect, it } from "vitest";
import { runToolCalls } from "./runner";
import { fakeGetVehicleById, fakeQueryVehicles, makeVehicle } from "./testFixtures";

const vehicles = [
  makeVehicle({ id: "a", make: "Porsche", price: 90_000 }),
  makeVehicle({ id: "b", make: "BMW", price: 60_000 }),
];

const ctx = () => ({
  tenantId: "tenant-1",
  queryVehicles: fakeQueryVehicles(vehicles).fn,
  getVehicleById: fakeGetVehicleById(vehicles),
});

describe("runToolCalls", () => {
  it("runs calls in order and aggregates actions and summaries", async () => {
    const result = await runToolCalls(
      [
        { name: "find_vehicles", args: { make: "Porsche" } },
        { name: "get_vehicle_details", args: { vehicleId: "a" } },
      ],
      ctx()
    );
    expect(result.ok).toBe(true);
    expect(result.steps).toHaveLength(2);
    expect(result.summaries).toHaveLength(2);
    // filter_inventory from find_vehicles, then highlight-vehicle from details.
    expect(result.actions.map((a) => a.type)).toEqual(["filter_inventory", "highlight-vehicle"]);
    expect(result.truncated).toBe(false);
  });

  it("caps execution at maxSteps and flags truncation", async () => {
    const calls = Array.from({ length: 4 }, () => ({
      name: "find_vehicles",
      args: { make: "Porsche" },
    }));
    const result = await runToolCalls(calls, ctx(), { maxSteps: 2 });
    expect(result.steps).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it("continues past a failure by default and reports ok=false", async () => {
    const result = await runToolCalls(
      [
        { name: "does_not_exist", args: {} },
        { name: "find_vehicles", args: { make: "Porsche" } },
      ],
      ctx()
    );
    expect(result.steps).toHaveLength(2);
    expect(result.ok).toBe(false);
    expect(result.steps[0].result.error?.code).toBe("unknown_tool");
    expect(result.steps[1].result.ok).toBe(true);
  });

  it("stops after the first failure when stopOnError is set", async () => {
    const result = await runToolCalls(
      [
        { name: "does_not_exist", args: {} },
        { name: "find_vehicles", args: { make: "Porsche" } },
      ],
      ctx(),
      { stopOnError: true }
    );
    expect(result.steps).toHaveLength(1);
    expect(result.ok).toBe(false);
  });
});
