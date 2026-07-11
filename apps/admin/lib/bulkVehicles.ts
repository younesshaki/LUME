import type { VehicleStatus } from "@lume/types";

export const MAX_BULK_VEHICLES = 200;

export type BulkPriceRule = {
  kind: "percent" | "fixed" | "set";
  value: number;
};

export type BulkPricePreview = {
  affected: number;
  minimum: number;
  maximum: number;
  totalBefore: number;
  totalAfter: number;
  error: string | null;
};

export type BulkVehicleRow = {
  id: string;
  price: number;
  status: VehicleStatus;
  soldAt: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PRICE = 2_147_483_647;

export function normalizeSelectedVehicleIds(rawIds: readonly string[]): {
  ids: string[];
  error: string | null;
} {
  const ids = [...new Set(rawIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return { ids: [], error: "Select at least one vehicle." };
  if (ids.length > MAX_BULK_VEHICLES) {
    return { ids: [], error: `Select at most ${MAX_BULK_VEHICLES} vehicles.` };
  }
  if (ids.some((id) => !UUID_PATTERN.test(id))) {
    return { ids: [], error: "The vehicle selection is invalid." };
  }
  return { ids, error: null };
}

export function normalizeBulkPriceRule(kind: string, rawValue: number): BulkPriceRule | null {
  if (!Number.isFinite(rawValue)) return null;
  if (kind === "percent" && rawValue > -100 && rawValue <= 1_000 && rawValue !== 0) {
    return { kind, value: rawValue };
  }
  if (kind === "fixed" && Math.abs(rawValue) <= 100_000_000 && rawValue !== 0) {
    return { kind, value: rawValue };
  }
  if (kind === "set" && rawValue > 0 && rawValue <= MAX_PRICE) {
    return { kind, value: rawValue };
  }
  return null;
}

export function calculateBulkVehiclePrice(price: number, rule: BulkPriceRule): number | null {
  const next =
    rule.kind === "percent"
      ? Math.round(price * (1 + rule.value / 100))
      : rule.kind === "fixed"
        ? Math.round(price + rule.value)
        : Math.round(rule.value);
  return next >= 1 && next <= MAX_PRICE ? next : null;
}

export function previewBulkVehiclePrices(
  rows: readonly Pick<BulkVehicleRow, "price">[],
  rule: BulkPriceRule,
): BulkPricePreview {
  if (rows.length === 0) {
    return {
      affected: 0,
      minimum: 0,
      maximum: 0,
      totalBefore: 0,
      totalAfter: 0,
      error: "Select at least one vehicle.",
    };
  }

  let minimum = Number.POSITIVE_INFINITY;
  let maximum = 0;
  let totalBefore = 0;
  let totalAfter = 0;
  for (const row of rows) {
    const next = calculateBulkVehiclePrice(row.price, rule);
    if (next === null) {
      return {
        affected: rows.length,
        minimum: 0,
        maximum: 0,
        totalBefore: 0,
        totalAfter: 0,
        error: "This rule would create an invalid vehicle price.",
      };
    }
    totalBefore += row.price;
    totalAfter += next;
    minimum = Math.min(minimum, next);
    maximum = Math.max(maximum, next);
  }
  return {
    affected: rows.length,
    minimum,
    maximum,
    totalBefore,
    totalAfter,
    error: null,
  };
}
