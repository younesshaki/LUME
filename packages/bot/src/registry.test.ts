import { describe, expect, it } from "vitest";
import { BOT_TOOLS, getBotTool, runBotTool, toToolSpecs } from "./registry";
import { fakeQueryVehicles, makeVehicle } from "./testFixtures";

const baseCtx = (vehicles = [makeVehicle()]) => ({
  tenantId: "tenant-1",
  queryVehicles: fakeQueryVehicles(vehicles).fn,
});

describe("registry", () => {
  it("exposes find_vehicles and find_best_deal", () => {
    expect(BOT_TOOLS.map((t) => t.name).sort()).toEqual(["find_best_deal", "find_vehicles"]);
    expect(getBotTool("find_vehicles")?.name).toBe("find_vehicles");
    expect(getBotTool("nope")).toBeUndefined();
  });

  it("emits DeepSeek-compatible tool specs", () => {
    const specs = toToolSpecs();
    const findVehicles = specs.find((s) => s.function.name === "find_vehicles");
    expect(findVehicles?.type).toBe("function");
    expect(findVehicles?.function.parameters.type).toBe("object");
    expect(findVehicles?.function.parameters.properties?.stockType).toEqual({
      type: "string",
      enum: ["New", "Used"],
      description: "Whether the vehicle is new or used.",
    });
  });
});

describe("runBotTool", () => {
  it("returns an unknown_tool error for an unregistered name", async () => {
    const result = await runBotTool("teleport", {}, baseCtx());
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("unknown_tool");
  });

  it("returns invalid_args when arguments fail schema validation", async () => {
    const result = await runBotTool("find_vehicles", { priceMin: "lots" }, baseCtx());
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_args");
  });

  it("runs find_vehicles and emits a filter_inventory action", async () => {
    const result = await runBotTool(
      "find_vehicles",
      { make: "Porsche", priceMax: 120_000 },
      baseCtx([makeVehicle({ make: "Porsche", price: 100_000 })])
    );
    expect(result.ok).toBe(true);
    expect(result.summary).toMatch(/found 1 matching vehicle/i);
    expect(result.actions?.[0]).toMatchObject({
      type: "filter_inventory",
      make: "Porsche",
      priceMax: 120_000,
    });
  });

  it("captures executor errors as execution_error", async () => {
    const result = await runBotTool("find_vehicles", { make: "Porsche" }, {
      tenantId: "tenant-1",
      queryVehicles: async () => {
        throw new Error("db down");
      },
    });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("execution_error");
    expect(result.error?.message).toBe("db down");
  });

  it("ranks best deals and highlights the top vehicle", async () => {
    const result = await runBotTool(
      "find_best_deal",
      { limit: 2 },
      baseCtx([
        makeVehicle({ id: "expensive", price: 150_000, mileage: 20_000 }),
        makeVehicle({ id: "cheap", price: 60_000, mileage: 20_000 }),
        makeVehicle({ id: "mid", price: 100_000, mileage: 20_000 }),
      ])
    );
    expect(result.ok).toBe(true);
    const deals = (result.data as { deals: Array<{ vehicleId: string }> }).deals;
    expect(deals).toHaveLength(2);
    expect(deals[0].vehicleId).toBe("cheap");
    expect(result.actions?.[0]).toEqual({ type: "highlight-vehicle", vehicleId: "cheap" });
  });
});
