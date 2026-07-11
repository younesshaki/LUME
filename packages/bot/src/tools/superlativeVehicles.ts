import { z } from "zod";
import type {
  BotTool,
  BotToolContext,
  BotToolResult,
  SuperlativeVehicle,
} from "../types";

export const superlativeVehicleSchema = z.object({});
export type SuperlativeVehicleArgs = z.infer<typeof superlativeVehicleSchema>;

export function findCheapest<T extends SuperlativeVehicle>(
  vehicles: readonly T[] | null | undefined
): T | null {
  return selectExtreme(vehicles, validPrice, "min");
}

export function findNewest<T extends SuperlativeVehicle>(
  vehicles: readonly T[] | null | undefined
): T | null {
  return selectExtreme(vehicles, validYear, "max");
}

export function findMostRecent<T extends SuperlativeVehicle>(
  vehicles: readonly T[] | null | undefined
): T | null {
  return selectExtreme(vehicles, validCreatedAt, "max");
}

export const findCheapestTool: BotTool<typeof superlativeVehicleSchema> = {
  name: "find_cheapest",
  description:
    "Return the lowest-priced vehicle in the tenant's live inventory. " +
    "Use this for cheapest, lowest-price, or most affordable requests.",
  schema: superlativeVehicleSchema,
  async execute(_args, ctx) {
    return executeSuperlative(ctx, findCheapest, "cheapest", (vehicle) =>
      `The cheapest vehicle is ${vehicle.id} at ${formatPrice(vehicle.price)}.`
    );
  },
};

export const findNewestTool: BotTool<typeof superlativeVehicleSchema> = {
  name: "find_newest",
  description:
    "Return the vehicle with the newest model year in the tenant's live inventory.",
  schema: superlativeVehicleSchema,
  async execute(_args, ctx) {
    return executeSuperlative(ctx, findNewest, "newest", (vehicle) =>
      `The newest model-year vehicle is ${vehicle.id} (${vehicle.year ?? "year unavailable"}).`
    );
  },
};

export const findMostRecentTool: BotTool<typeof superlativeVehicleSchema> = {
  name: "find_most_recent",
  description:
    "Return the most recently listed vehicle in the tenant's live inventory.",
  schema: superlativeVehicleSchema,
  async execute(_args, ctx) {
    return executeSuperlative(ctx, findMostRecent, "most recent", (vehicle) =>
      `The most recently listed vehicle is ${vehicle.id}.`
    );
  },
};

type Selector = (
  vehicles: readonly SuperlativeVehicle[] | null | undefined
) => SuperlativeVehicle | null;

async function executeSuperlative(
  ctx: BotToolContext,
  selector: Selector,
  label: string,
  summary: (vehicle: SuperlativeVehicle) => string
): Promise<BotToolResult<{ vehicle: SuperlativeVehicle | null }>> {
  if (!ctx.getSuperlativeVehicles) {
    return {
      ok: false,
      summary: `The ${label} vehicle lookup is not available yet.`,
      error: {
        code: "execution_error",
        message: "The host has not wired getSuperlativeVehicles.",
      },
    };
  }

  const vehicle = selector(await ctx.getSuperlativeVehicles());
  if (!vehicle) {
    return {
      ok: true,
      summary: `No vehicle with valid data is available for the ${label} lookup.`,
      data: { vehicle: null },
    };
  }

  return {
    ok: true,
    summary: summary(vehicle),
    data: { vehicle },
    actions: [{ type: "highlight-vehicle", vehicleId: vehicle.id }],
  };
}

function selectExtreme<T extends SuperlativeVehicle>(
  vehicles: readonly T[] | null | undefined,
  metric: (vehicle: T) => number | null,
  direction: "min" | "max"
): T | null {
  let selected: T | null = null;
  let selectedMetric = 0;

  for (const vehicle of vehicles ?? []) {
    const value = metric(vehicle);
    if (value === null) continue;

    if (
      selected === null ||
      (direction === "min" ? value < selectedMetric : value > selectedMetric) ||
      (value === selectedMetric && compareIds(vehicle.id, selected.id) < 0)
    ) {
      selected = vehicle;
      selectedMetric = value;
    }
  }

  return selected;
}

function validPrice(vehicle: SuperlativeVehicle): number | null {
  return typeof vehicle.price === "number" &&
    Number.isFinite(vehicle.price) &&
    vehicle.price >= 0
    ? vehicle.price
    : null;
}

function validYear(vehicle: SuperlativeVehicle): number | null {
  return typeof vehicle.year === "number" &&
    Number.isInteger(vehicle.year) &&
    vehicle.year > 0
    ? vehicle.year
    : null;
}

function validCreatedAt(vehicle: SuperlativeVehicle): number | null {
  if (!vehicle.createdAt) return null;
  const timestamp = Date.parse(vehicle.createdAt);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function compareIds(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function formatPrice(price: number | null): string {
  return typeof price === "number"
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(price)
    : "an unavailable price";
}
