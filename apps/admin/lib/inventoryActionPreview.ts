import type {
  BotAction,
  BotInventoryFilterAction,
  Vehicle,
} from "@lume/types";

const MAX_PUBLIC_PREVIEW_RESULTS = 24;
const FILTER_FIELDS = [
  "make",
  "model",
  "stockType",
  "priceMin",
  "priceMax",
  "bodyStyle",
  "fuelType",
  "drivetrain",
  "sellerState",
  "sellerCity",
  "yearMin",
  "yearMax",
  "mileageMax",
  "sort",
  "limit",
] as const satisfies readonly (keyof BotInventoryFilterAction)[];

/**
 * Attach result data only to the exact filter action the server just queried.
 * A model-authored action with even one differing facet must fetch normally;
 * pairing it with another query's cars would make the page contradict chat.
 */
export function attachInventoryActionPreview(
  actions: readonly BotAction[],
  expected: BotInventoryFilterAction | null,
  vehicles: readonly Vehicle[] | undefined,
  totalCount: number | null,
): BotAction[] {
  if (!expected || !vehicles || totalCount === null || totalCount < 0) return [...actions];
  const pageSize = boundedPreviewLimit(expected.limit);
  const preview = {
    vehicles: vehicles.slice(0, pageSize).map(toPublicPreviewVehicle),
    totalCount,
    hasMore: totalCount > Math.min(vehicles.length, pageSize),
  };
  return actions.map((action) =>
    action.type === "filter_inventory" && sameInventoryAction(action, expected)
      ? { ...action, initialResults: preview }
      : action,
  );
}

function sameInventoryAction(
  left: BotInventoryFilterAction,
  right: BotInventoryFilterAction,
): boolean {
  return FILTER_FIELDS.every((field) => left[field] === right[field]);
}

function boundedPreviewLimit(limit: number | undefined): number {
  return typeof limit === "number" && Number.isSafeInteger(limit) && limit >= 1
    ? Math.min(limit, MAX_PUBLIC_PREVIEW_RESULTS)
    : MAX_PUBLIC_PREVIEW_RESULTS;
}

function toPublicPreviewVehicle(vehicle: Vehicle) {
  return {
    id: vehicle.id,
    stockType: vehicle.stockType,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.trim,
    price: vehicle.price,
    mileage: vehicle.mileage,
    bodyStyle: vehicle.bodyStyle,
    exteriorColor: vehicle.exteriorColor,
    interiorColor: vehicle.interiorColor,
    drivetrain: vehicle.drivetrain,
    fuelType: vehicle.fuelType,
    imageSrc: vehicle.imageSrc,
    ...(vehicle.primaryImageSrc ? { primaryImageSrc: vehicle.primaryImageSrc } : {}),
    ...(vehicle.primaryImageAlt ? { primaryImageAlt: vehicle.primaryImageAlt } : {}),
    sellerCity: vehicle.sellerCity,
    sellerState: vehicle.sellerState,
    isSpecial: vehicle.isSpecial,
    ...(vehicle.specialImageSrc ? { specialImageSrc: vehicle.specialImageSrc } : {}),
  };
}
