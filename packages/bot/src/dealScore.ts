import type { Vehicle } from "@lume/types";

/**
 * Aggregates describing the comparison set a vehicle is scored against.
 * Built from the candidate list returned by a search so scoring is relative
 * to what the tenant actually has in stock, not a global market feed.
 */
export type MarketContext = {
  medianPrice: number;
  medianMileage: number | null;
  currentYear: number;
};

export type DealScore = {
  /** 0–100; higher means a stronger value relative to the comparison set. */
  score: number;
  reasons: string[];
};

export type RankedVehicle = {
  vehicle: Vehicle;
  score: number;
  reasons: string[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/**
 * Build a comparison context from a candidate list. Mileage median ignores
 * vehicles with unknown mileage; if none report it, mileage is not scored.
 */
export function buildMarketContext(
  vehicles: Vehicle[],
  currentYear: number = new Date().getFullYear()
): MarketContext {
  const prices = vehicles.map((v) => v.price).filter((p) => Number.isFinite(p) && p > 0);
  const mileages = vehicles
    .map((v) => v.mileage)
    .filter((m): m is number => typeof m === "number" && Number.isFinite(m) && m >= 0);

  return {
    medianPrice: median(prices),
    medianMileage: mileages.length > 0 ? median(mileages) : null,
    currentYear,
  };
}

/**
 * Transparent, deterministic value heuristic. Starts at a neutral 50 and
 * adjusts for price vs the comparison median, mileage vs median, and model
 * age. Every adjustment is bounded so no single factor dominates, and the
 * human-readable reasons mirror the math for explainability in the UI.
 */
export function dealScore(vehicle: Vehicle, context: MarketContext): DealScore {
  let score = 50;
  const reasons: string[] = [];

  if (context.medianPrice > 0 && vehicle.price > 0) {
    const ratio = vehicle.price / context.medianPrice;
    score += clamp((1 - ratio) * 60, -30, 30);
    if (ratio <= 0.9) {
      reasons.push(`Priced ${formatPercent(1 - ratio)} below comparable listings`);
    } else if (ratio >= 1.1) {
      reasons.push(`Priced ${formatPercent(ratio - 1)} above comparable listings`);
    }
  }

  if (
    context.medianMileage !== null &&
    context.medianMileage > 0 &&
    typeof vehicle.mileage === "number"
  ) {
    const ratio = vehicle.mileage / context.medianMileage;
    score += clamp((1 - ratio) * 30, -20, 20);
    if (ratio <= 0.85) {
      reasons.push("Lower mileage than similar vehicles");
    } else if (ratio >= 1.15) {
      reasons.push("Higher mileage than similar vehicles");
    }
  }

  const age = context.currentYear - vehicle.year;
  if (age <= 1) {
    score += 5;
    reasons.push("Current or near-current model year");
  } else if (age >= 8) {
    score -= 5;
  }

  return { score: Math.round(clamp(score, 0, 100)), reasons };
}

/**
 * Score every vehicle against a context built from the set itself and return
 * them sorted best-deal first. Ties break toward the lower price.
 */
export function rankByDealScore(
  vehicles: Vehicle[],
  currentYear: number = new Date().getFullYear()
): RankedVehicle[] {
  const context = buildMarketContext(vehicles, currentYear);
  return vehicles
    .map((vehicle) => {
      const { score, reasons } = dealScore(vehicle, context);
      return { vehicle, score, reasons };
    })
    .sort((a, b) => b.score - a.score || a.vehicle.price - b.vehicle.price);
}
