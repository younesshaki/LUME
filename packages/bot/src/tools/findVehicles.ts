import { z } from "zod";
import type { VehicleQuery, VehicleSort } from "@lume/types";
import type { BotTool, BotToolResult } from "../types";

const VEHICLE_SORTS = [
  "recommended",
  "price_asc",
  "price_desc",
  "year_desc",
  "year_asc",
  "mileage_asc",
  "mileage_desc",
] as const satisfies readonly VehicleSort[];

export const findVehiclesSchema = z.object({
  make: z.string().describe("Manufacturer to filter by, e.g. 'Porsche'.").optional(),
  model: z.string().describe("Model name to filter by, e.g. '911'.").optional(),
  bodyStyle: z.string().describe("Body style, e.g. 'SUV', 'Coupe', 'Sedan'.").optional(),
  fuelType: z.string().describe("Fuel type, e.g. 'Gas', 'Electric', 'Hybrid'.").optional(),
  drivetrain: z.string().describe("Drivetrain, e.g. 'AWD', 'RWD'.").optional(),
  stockType: z.enum(["New", "Used"]).describe("Whether the vehicle is new or used.").optional(),
  priceMin: z.number().nonnegative().describe("Minimum price in dollars.").optional(),
  priceMax: z.number().nonnegative().describe("Maximum price in dollars.").optional(),
  yearMin: z.number().int().describe("Earliest model year.").optional(),
  yearMax: z.number().int().describe("Latest model year.").optional(),
  mileageMax: z.number().nonnegative().describe("Maximum mileage.").optional(),
  sort: z
    .enum(VEHICLE_SORTS)
    .describe("Result ordering. Defaults to 'recommended'.")
    .optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .describe("Max number of vehicles to return (1–50).")
    .default(12),
});

export type FindVehiclesArgs = z.infer<typeof findVehiclesSchema>;

/**
 * Pure mapping from coarse bot arguments to the canonical VehicleQuery the
 * data layer understands. Exported separately so the translation is unit
 * tested without touching a database.
 */
export function buildVehicleQuery(args: FindVehiclesArgs): VehicleQuery {
  const query: VehicleQuery = { limit: args.limit, sort: args.sort ?? "recommended" };
  if (args.make) query.make = args.make;
  if (args.model) query.model = args.model;
  if (args.bodyStyle) query.bodyStyle = args.bodyStyle;
  if (args.fuelType) query.fuelType = args.fuelType;
  if (args.drivetrain) query.drivetrain = args.drivetrain;
  if (args.stockType) query.stockType = args.stockType;
  if (args.priceMin !== undefined) query.priceMin = args.priceMin;
  if (args.priceMax !== undefined) query.priceMax = args.priceMax;
  if (args.yearMin !== undefined) query.yearMin = args.yearMin;
  if (args.yearMax !== undefined) query.yearMax = args.yearMax;
  if (args.mileageMax !== undefined) query.mileageMax = args.mileageMax;
  return query;
}

export const findVehiclesTool: BotTool<typeof findVehiclesSchema> = {
  name: "find_vehicles",
  description:
    "Search the dealership's live inventory by make, model, body style, price, " +
    "year, mileage and more. Returns matching vehicles and applies the same " +
    "filters to the on-screen inventory.",
  schema: findVehiclesSchema,
  async execute(args, ctx): Promise<BotToolResult> {
    const query = buildVehicleQuery(args);
    const result = await ctx.queryVehicles(query);

    const count = result.totalCount;
    const summary =
      count === 0
        ? "No vehicles match those criteria right now."
        : `Found ${count} matching vehicle${count === 1 ? "" : "s"}` +
          (result.hasMore ? ` (showing ${result.vehicles.length}).` : ".");

    return {
      ok: true,
      summary,
      data: {
        totalCount: count,
        hasMore: result.hasMore,
        vehicles: result.vehicles,
      },
      // Mirror the search onto the public inventory UI. filter_inventory is
      // intentionally coarse, matching BotInventoryFilterAction.
      actions: [
        {
          type: "filter_inventory",
          ...(args.make ? { make: args.make } : {}),
          ...(args.priceMin !== undefined ? { priceMin: args.priceMin } : {}),
          ...(args.priceMax !== undefined ? { priceMax: args.priceMax } : {}),
          ...(args.bodyStyle ? { bodyStyle: args.bodyStyle } : {}),
        },
      ],
    };
  },
};
