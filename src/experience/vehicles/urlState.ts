import {
  DEFAULT_FILTERS,
  YEAR_MAX,
  YEAR_MIN,
  type VehicleFilters,
  type VehicleSort,
} from "./catalog";

export type VehicleUrlState = {
  filters: VehicleFilters;
  sort: VehicleSort;
  page: number;
};

const SORT_VALUES: VehicleSort[] = [
  "recommended",
  "price_asc",
  "price_desc",
  "year_desc",
  "year_asc",
  "mileage_asc",
  "mileage_desc",
];

function readNumber(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readSort(value: string | null): VehicleSort {
  return SORT_VALUES.includes(value as VehicleSort)
    ? (value as VehicleSort)
    : "recommended";
}

export function readVehicleUrlState(): VehicleUrlState {
  if (typeof window === "undefined") {
    return { filters: DEFAULT_FILTERS, sort: "recommended", page: 1 };
  }

  const hash = window.location.hash;
  const query = hash.startsWith("#vehicles?") ? hash.slice("#vehicles?".length) : "";
  const params = new URLSearchParams(query);

  return {
    filters: {
      ...DEFAULT_FILTERS,
      query: params.get("query") ?? "",
      stockType: params.get("stockType") ?? "",
      make: params.get("make") ?? "",
      model: params.get("model") ?? "",
      bodyStyle: params.get("bodyStyle") ?? "",
      fuelType: params.get("fuelType") ?? "",
      drivetrain: params.get("drivetrain") ?? "",
      sellerState: params.get("state") ?? "",
      sellerCity: params.get("city") ?? "",
      yearMin: readNumber(params.get("yearMin"), YEAR_MIN),
      yearMax: readNumber(params.get("yearMax"), YEAR_MAX),
      mileageMax: readNumber(params.get("mileageMax"), 0),
      priceMin: readNumber(params.get("priceMin"), 0),
      priceMax: readNumber(params.get("priceMax"), 0),
    },
    sort: readSort(params.get("sort")),
    page: Math.max(1, readNumber(params.get("page"), 1)),
  };
}

export function encodeVehicleUrlState(
  filters: VehicleFilters,
  sort: VehicleSort,
  page: number
): string {
  const params = new URLSearchParams();

  if (filters.query.trim()) params.set("query", filters.query.trim());
  if (filters.stockType) params.set("stockType", filters.stockType);
  if (filters.make) params.set("make", filters.make);
  if (filters.model) params.set("model", filters.model);
  if (filters.bodyStyle) params.set("bodyStyle", filters.bodyStyle);
  if (filters.fuelType) params.set("fuelType", filters.fuelType);
  if (filters.drivetrain) params.set("drivetrain", filters.drivetrain);
  if (filters.sellerState) params.set("state", filters.sellerState);
  if (filters.sellerCity) params.set("city", filters.sellerCity);
  if (filters.yearMin !== YEAR_MIN) params.set("yearMin", String(filters.yearMin));
  if (filters.yearMax !== YEAR_MAX) params.set("yearMax", String(filters.yearMax));
  if (filters.mileageMax > 0) params.set("mileageMax", String(filters.mileageMax));
  if (filters.priceMin > 0) params.set("priceMin", String(filters.priceMin));
  if (filters.priceMax > 0) params.set("priceMax", String(filters.priceMax));
  if (sort !== "recommended") params.set("sort", sort);
  if (page > 1) params.set("page", String(page));

  const encoded = params.toString();
  return encoded ? `#vehicles?${encoded}` : "#vehicles";
}

export function writeVehicleUrlState(
  filters: VehicleFilters,
  sort: VehicleSort,
  page: number
): string {
  const hash = encodeVehicleUrlState(filters, sort, page);
  if (typeof window !== "undefined" && window.location.hash !== hash) {
    window.history.replaceState(null, "", hash);
  }
  return hash;
}
