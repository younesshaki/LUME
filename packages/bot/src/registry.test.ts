import { describe, expect, it } from "vitest";
import {
  BOT_TOOLS,
  filterBotTools,
  getBotTool,
  runBotTool,
  toToolSpecs,
} from "./registry";
import { fakeQueryVehicles, makeVehicle } from "./testFixtures";

const baseCtx = (vehicles = [makeVehicle()]) => ({
  tenantId: "tenant-1",
  queryVehicles: fakeQueryVehicles(vehicles).fn,
});

describe("registry", () => {
  it("exposes the registered tools", () => {
    expect(BOT_TOOLS.map((t) => t.name).sort()).toEqual([
      "compare_vehicles",
      "find_best_deal",
      "find_cheapest",
      "find_most_recent",
      "find_newest",
      "find_vehicles",
      "get_vehicle_details",
    ]);
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

  it.each([undefined, null])(
    "preserves the full legacy registry for a missing allowlist (%s)",
    (allowlist) => {
      const filtered = filterBotTools(allowlist);

      expect(filtered.map((tool) => tool.name)).toEqual(BOT_TOOLS.map((tool) => tool.name));
      expect(filtered).not.toBe(BOT_TOOLS);
    }
  );

  it("returns no tools for an explicit empty allowlist", () => {
    expect(filterBotTools([])).toEqual([]);
  });

  it("preserves registry order and ignores unknown or duplicate names", () => {
    const filtered = filterBotTools([
      "find_newest",
      "not_registered",
      "find_vehicles",
      "find_newest",
    ]);

    expect(filtered.map((tool) => tool.name)).toEqual(["find_vehicles", "find_newest"]);
    expect(toToolSpecs(filtered).map((spec) => spec.function.name)).toEqual([
      "find_vehicles",
      "find_newest",
    ]);
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

  it("mirrors every grounded inventory constraint onto the browser action", async () => {
    const result = await runBotTool(
      "find_vehicles",
      {
        make: "BMW",
        model: "X3",
        stockType: "Used",
        fuelType: "Gasoline",
        drivetrain: "AWD",
        yearMin: 2020,
        yearMax: 2020,
        mileageMax: 55_000,
        priceMin: 40_000,
        priceMax: 70_000,
      },
      baseCtx([makeVehicle({ make: "BMW", model: "X3", price: 64_500 })]),
    );
    expect(result.actions?.[0]).toMatchObject({
      type: "filter_inventory",
      make: "BMW",
      model: "X3",
      stockType: "Used",
      fuelType: "Gasoline",
      drivetrain: "AWD",
      yearMin: 2020,
      yearMax: 2020,
      mileageMax: 55_000,
      priceMin: 40_000,
      priceMax: 70_000,
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
