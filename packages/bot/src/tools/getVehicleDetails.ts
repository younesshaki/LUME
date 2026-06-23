import { z } from "zod";
import type { BotTool, BotToolResult } from "../types";

export const getVehicleDetailsSchema = z.object({
  vehicleId: z.string().min(1).describe("The id of the vehicle to fetch full details for."),
});

export type GetVehicleDetailsArgs = z.infer<typeof getVehicleDetailsSchema>;

export const getVehicleDetailsTool: BotTool<typeof getVehicleDetailsSchema> = {
  name: "get_vehicle_details",
  description:
    "Fetch the full details of a single vehicle by its id — use after a search " +
    "when the visitor asks about a specific car. Highlights it on screen.",
  schema: getVehicleDetailsSchema,
  async execute(args, ctx): Promise<BotToolResult> {
    if (!ctx.getVehicleById) {
      return {
        ok: false,
        summary: "Single-vehicle lookup isn't available in this context.",
        error: { code: "execution_error", message: "getVehicleById not provided by host." },
      };
    }

    const vehicle = await ctx.getVehicleById(args.vehicleId);
    if (!vehicle) {
      return {
        ok: true,
        summary: "No vehicle matches that id — it may have sold or been removed.",
        data: { vehicle: null },
      };
    }

    const label = `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim}`.trim();
    return {
      ok: true,
      summary: `${label} — $${vehicle.price.toLocaleString("en-US")}.`,
      data: { vehicle },
      actions: [{ type: "highlight-vehicle", vehicleId: vehicle.id }],
    };
  },
};
