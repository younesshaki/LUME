import { describe, expect, it, vi } from "vitest";
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

  it.each([undefined, null])(
    "allows registered tools when the allowlist is missing (%s)",
    async (allowedToolNames) => {
      const result = await runToolCalls(
        [{ name: "find_vehicles", args: { make: "Porsche" } }],
        ctx(),
        { allowedToolNames }
      );

      expect(result.steps[0].result.ok).toBe(true);
    }
  );

  it("blocks registered tools when the allowlist is explicitly empty", async () => {
    const queryVehicles = vi.fn(ctx().queryVehicles);
    const call = { id: "call-disabled", name: "find_vehicles", args: { make: "Porsche" } };

    const result = await runToolCalls(
      [call],
      { ...ctx(), queryVehicles },
      { allowedToolNames: [] }
    );

    expect(queryVehicles).not.toHaveBeenCalled();
    expect(result.steps).toEqual([
      {
        call,
        result: {
          ok: false,
          summary: "Tool unavailable: find_vehicles.",
          error: {
            code: "tool_not_allowed",
            message: 'Tool "find_vehicles" is not enabled for this tenant.',
          },
        },
      },
    ]);
    expect(result.actions).toEqual([]);
    expect(result.ok).toBe(false);
  });

  it("runs an allowed subset and returns blocked calls as normal tool steps", async () => {
    const queryVehicles = vi.fn(ctx().queryVehicles);
    const result = await runToolCalls(
      [
        { id: "allowed", name: "find_vehicles", args: { make: "Porsche" } },
        { id: "blocked", name: "get_vehicle_details", args: { vehicleId: "a" } },
        { id: "allowed-again", name: "find_vehicles", args: { make: "BMW" } },
      ],
      { ...ctx(), queryVehicles },
      { allowedToolNames: ["unknown_config_name", "find_vehicles", "find_vehicles"] }
    );

    expect(queryVehicles).toHaveBeenCalledTimes(2);
    expect(result.steps.map((step) => step.call.id)).toEqual([
      "allowed",
      "blocked",
      "allowed-again",
    ]);
    expect(result.steps.map((step) => step.result.error?.code ?? null)).toEqual([
      null,
      "tool_not_allowed",
      null,
    ]);
    expect(result.ok).toBe(false);
  });

  it("keeps hallucinated names as unknown_tool even with an allowlist", async () => {
    const queryVehicles = vi.fn(ctx().queryVehicles);
    const result = await runToolCalls(
      [{ id: "hallucinated", name: "launch_rocket", args: {} }],
      { ...ctx(), queryVehicles },
      { allowedToolNames: [] }
    );

    expect(queryVehicles).not.toHaveBeenCalled();
    expect(result.steps[0].call.id).toBe("hallucinated");
    expect(result.steps[0].result.error?.code).toBe("unknown_tool");
  });

  it("honours stopOnError for blocked tools without executing later calls", async () => {
    const queryVehicles = vi.fn(ctx().queryVehicles);
    const result = await runToolCalls(
      [
        { name: "get_vehicle_details", args: { vehicleId: "a" } },
        { name: "find_vehicles", args: { make: "Porsche" } },
      ],
      { ...ctx(), queryVehicles },
      { allowedToolNames: ["find_vehicles"], stopOnError: true }
    );

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].result.error?.code).toBe("tool_not_allowed");
    expect(queryVehicles).not.toHaveBeenCalled();
  });
});
