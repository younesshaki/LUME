import { z } from "zod";
import type { BotTool, BotToolResult } from "../types";
import { rankByDealScore } from "../dealScore";
import { buildVehicleQuery, findVehiclesSchema } from "./findVehicles";

/**
 * find_best_deal reuses the find_vehicles filter surface but reframes intent:
 * pull a broad candidate set, then rank by the value heuristic rather than a
 * raw sort. `limit` here bounds how many ranked results to surface.
 */
export const findBestDealSchema = findVehiclesSchema.extend({
  limit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .describe("How many top-value vehicles to return (1–10).")
    .default(3),
});

export type FindBestDealArgs = z.infer<typeof findBestDealSchema>;

/** Candidate pool to score before trimming to the requested top N. */
const CANDIDATE_POOL = 50;

export const findBestDealTool: BotTool<typeof findBestDealSchema> = {
  name: "find_best_deal",
  description:
    "Find the best-value vehicles matching the visitor's criteria. Scores " +
    "candidates on price and mileage relative to comparable in-stock vehicles " +
    "and returns the strongest deals with a short explanation for each.",
  schema: findBestDealSchema,
  async execute(args, ctx): Promise<BotToolResult> {
    // Pull a wide pool (best-value can hide outside the top few by raw price),
    // then rank. Recommended sort keeps the pool representative.
    const query = buildVehicleQuery({ ...args, sort: "recommended", limit: CANDIDATE_POOL });
    const result = await ctx.queryVehicles(query);

    if (result.vehicles.length === 0) {
      return {
        ok: true,
        summary: "No vehicles match those criteria, so there's no deal to rank yet.",
        data: { deals: [] },
      };
    }

    const ranked = rankByDealScore(result.vehicles).slice(0, args.limit);
    const top = ranked[0];
    const topLabel = `${top.vehicle.year} ${top.vehicle.make} ${top.vehicle.model}`.trim();

    return {
      ok: true,
      summary:
        `Top value: ${topLabel} (deal score ${top.score}/100)` +
        (top.reasons.length > 0 ? ` — ${top.reasons[0]}.` : "."),
      data: {
        deals: ranked.map((entry) => ({
          vehicleId: entry.vehicle.id,
          label: `${entry.vehicle.year} ${entry.vehicle.make} ${entry.vehicle.model}`.trim(),
          price: entry.vehicle.price,
          score: entry.score,
          reasons: entry.reasons,
        })),
      },
      // Surface the single best deal in the UI.
      actions: [{ type: "highlight-vehicle", vehicleId: top.vehicle.id }],
    };
  },
};
