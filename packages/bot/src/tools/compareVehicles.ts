import { z } from "zod";
import type { Vehicle } from "@lume/types";
import type { BotTool, BotToolResult } from "../types";
import { buildMarketContext, dealScore } from "../dealScore";

export const compareVehiclesSchema = z.object({
  vehicleIds: z
    .array(z.string().min(1))
    .min(2)
    .max(4)
    .describe("The ids of 2–4 vehicles the visitor wants compared side by side."),
});

export type CompareVehiclesArgs = z.infer<typeof compareVehiclesSchema>;

type Comparison = {
  vehicleId: string;
  label: string;
  price: number;
  mileage: number | null;
  year: number;
  score: number;
  reasons: string[];
};

const label = (v: Vehicle) => `${v.year} ${v.make} ${v.model} ${v.trim}`.trim();

export const compareVehiclesTool: BotTool<typeof compareVehiclesSchema> = {
  name: "compare_vehicles",
  description:
    "Compare 2–4 specific vehicles side by side on price, mileage and value. " +
    "Scores each relative to the others and names the best value, highlighting it.",
  schema: compareVehiclesSchema,
  async execute(args, ctx): Promise<BotToolResult> {
    if (!ctx.getVehicleById) {
      return {
        ok: false,
        summary: "Vehicle comparison isn't available in this context.",
        error: { code: "execution_error", message: "getVehicleById not provided by host." },
      };
    }

    const fetched = await Promise.all(args.vehicleIds.map((id) => ctx.getVehicleById!(id)));
    const vehicles = fetched.filter((v): v is Vehicle => v !== null);

    if (vehicles.length < 2) {
      return {
        ok: true,
        summary: "Couldn't find at least two of those vehicles to compare.",
        data: { comparisons: [] },
      };
    }

    // Score each vehicle against the set being compared, so the value call is
    // relative to exactly the cars on screen.
    const context = buildMarketContext(vehicles, new Date().getFullYear());
    const comparisons: Comparison[] = vehicles.map((vehicle) => {
      const { score, reasons } = dealScore(vehicle, context);
      return {
        vehicleId: vehicle.id,
        label: label(vehicle),
        price: vehicle.price,
        mileage: vehicle.mileage,
        year: vehicle.year,
        score,
        reasons,
      };
    });

    const best = [...comparisons].sort((a, b) => b.score - a.score || a.price - b.price)[0];

    return {
      ok: true,
      summary: `Best value of the ${comparisons.length}: ${best.label} (deal score ${best.score}/100).`,
      data: { comparisons, bestValueVehicleId: best.vehicleId },
      actions: [{ type: "highlight-vehicle", vehicleId: best.vehicleId }],
    };
  },
};
