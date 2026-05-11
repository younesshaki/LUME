import { R2, mediaUrl, fallbackMediaUrl } from "@/config/cdn";

const CSV_KEY = "vehicles-with-generated-images.csv";

export type Vehicle = {
  id: string;
  stockType: "New" | "Used" | string;
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  mileage: number | null;
  bodyStyle: string;
  exteriorColor: string;
  interiorColor: string;
  drivetrain: string;
  fuelType: string;
  imageSrc: string;
  sellerCity: string;
  sellerState: string;
  isSpecial: boolean;
  specialImageSrc?: string;
};

export type VehicleFilters = {
  query: string;
  stockType: string;
  make: string;
  model: string;
  bodyStyle: string;
  fuelType: string;
  drivetrain: string;
  sellerState: string;
  sellerCity: string;
  yearMin: number;
  yearMax: number;
  mileageMax: number;
  priceMin: number;
  priceMax: number;
};

export type VehicleSort =
  | "recommended"
  | "price_asc"
  | "price_desc"
  | "year_desc"
  | "year_asc"
  | "mileage_asc"
  | "mileage_desc";

export const YEAR_MIN = 2003;
export const YEAR_MAX = 2027;

export const VEHICLE_SORT_OPTIONS: { label: string; value: VehicleSort }[] = [
  { label: "Recommended", value: "recommended" },
  { label: "Price: Low to High", value: "price_asc" },
  { label: "Price: High to Low", value: "price_desc" },
  { label: "Newest Year", value: "year_desc" },
  { label: "Oldest Year", value: "year_asc" },
  { label: "Mileage: Low to High", value: "mileage_asc" },
  { label: "Mileage: High to Low", value: "mileage_desc" },
];

export const PRICE_OPTIONS = [
  { label: "No min", value: 0 },
  { label: "$20,000", value: 20000 },
  { label: "$30,000", value: 30000 },
  { label: "$50,000", value: 50000 },
  { label: "$75,000", value: 75000 },
  { label: "$100,000", value: 100000 },
  { label: "$150,000", value: 150000 },
  { label: "$200,000", value: 200000 },
  { label: "$300,000", value: 300000 },
];

export const PRICE_MAX_OPTIONS = [
  { label: "No max", value: 0 },
  { label: "$30,000", value: 30000 },
  { label: "$50,000", value: 50000 },
  { label: "$75,000", value: 75000 },
  { label: "$100,000", value: 100000 },
  { label: "$150,000", value: 150000 },
  { label: "$200,000", value: 200000 },
  { label: "$300,000", value: 300000 },
  { label: "$500,000", value: 500000 },
];

export const DEFAULT_FILTERS: VehicleFilters = {
  query: "",
  stockType: "",
  make: "",
  model: "",
  bodyStyle: "",
  fuelType: "",
  drivetrain: "",
  sellerState: "",
  sellerCity: "",
  yearMin: YEAR_MIN,
  yearMax: YEAR_MAX,
  mileageMax: 0,
  priceMin: 0,
  priceMax: 0,
};

export const BODY_STYLES = [
  "SUV", "Sedan", "Coupe", "Truck", "Convertible",
  "Hatchback", "Wagon", "Minivan",
];

export const FUEL_TYPES = [
  "Gasoline", "Electric", "Hybrid", "Plug-In Hybrid", "Diesel", "Flex Fuel",
];

export const DRIVETRAINS = ["AWD", "4WD", "FWD", "RWD"];

export const MILEAGE_OPTIONS = [
  { label: "Any mileage", value: 0 },
  { label: "Under 5,000 mi", value: 5000 },
  { label: "Under 15,000 mi", value: 15000 },
  { label: "Under 30,000 mi", value: 30000 },
  { label: "Under 60,000 mi", value: 60000 },
  { label: "Under 100,000 mi", value: 100000 },
];

export const SPECIAL_IMAGES = [
  mediaUrl("vehicle%20images/vehicle-special-1.webp"), // BMW 740i
  mediaUrl("vehicle%20images/vehicle-special-2.webp"), // Porsche Cayenne
];

// Static registry — replace the data source with a Supabase query when backend is ready.
// Key: vehicle _primaryKey from CSV. Value: which SPECIAL_IMAGES index (0-based).
export const SPECIALS_REGISTRY: Record<string, { imageIndex: 0 | 1 }> = {
  "969c6fce-524c-4409-8b0d-6e0aa330d0d5": { imageIndex: 1 }, // BMW 740 740i
  "33b2ff3b-287c-46ad-b051-6aae9ee04f12": { imageIndex: 0 }, // Porsche Cayenne 2019
};

const FALLBACK_IMAGES = [
  mediaUrl("vehicle%20images/vehicle-type-1.webp"),
  mediaUrl("vehicle%20images/vehicle-type-2.webp"),
  mediaUrl("vehicle%20images/vehicle-type-3.webp"),
  mediaUrl("vehicle%20images/vehicle-type-4.webp"),
  mediaUrl("vehicle%20images/vehicle-type-5.webp"),
  mediaUrl("vehicle%20images/vehicle-type-6.webp"),
  mediaUrl("vehicle%20images/vehicle-type-7.webp"),
];

const PRICE_TIERS: { makes: string[]; min: number; max: number }[] = [
  { makes: ["Ferrari", "Lamborghini", "Rolls-Royce", "Maserati"], min: 180000, max: 650000 },
  { makes: ["Porsche", "Mercedes-Benz", "BMW", "Audi", "Lexus", "Land Rover", "Jaguar", "Genesis", "Cadillac", "Lincoln"], min: 55000, max: 185000 },
  { makes: ["Tesla", "Polestar", "Acura", "INFINITI", "Volvo", "Buick"], min: 32000, max: 85000 },
];
const PRICE_DEFAULT = { min: 18000, max: 58000 };

function generatePrice(make: string, year: number, mileage: number | null, id: string): number {
  const tier = PRICE_TIERS.find((t) => t.makes.includes(make)) ?? PRICE_DEFAULT;
  const hash = Math.abs(hashString(id));
  let price = tier.min + (hash % (tier.max - tier.min));

  const age = 2026 - year;
  if (age <= 1) price *= 1.18;
  else if (age <= 3) price *= 1.06;
  else if (age >= 10) price *= 0.68;
  else if (age >= 6) price *= 0.84;

  if (mileage !== null && mileage > 0) {
    if (mileage > 60000) price *= 0.82;
    else if (mileage > 25000) price *= 0.91;
    else if (mileage < 5000) price *= 1.07;
  }

  return Math.round(price / 500) * 500;
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function normalizeDrivetrain(raw: string): string {
  const v = raw.trim().toUpperCase();
  if (v === "AWD" || v.startsWith("ALL")) return "AWD";
  if (v === "4WD" || v.startsWith("FOUR")) return "4WD";
  if (v === "FWD" || v.startsWith("FRONT")) return "FWD";
  if (v === "RWD" || v.startsWith("REAR")) return "RWD";
  return raw.trim();
}

function normalizeFuelType(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (v === "gasoline" || v === "gas" || v.includes("unleaded")) return "Gasoline";
  if (v === "electric") return "Electric";
  if (v === "plug-in hybrid") return "Plug-In Hybrid";
  if (v === "hybrid") return "Hybrid";
  if (v === "diesel") return "Diesel";
  if (v.includes("flex") || v.includes("e85")) return "Flex Fuel";
  return raw.trim();
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split("\n");
  const headers = parseCSVLine(lines[0]);
  const result: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] ?? "";
    });
    result.push(row);
  }
  return result;
}

let cached: Vehicle[] | null = null;

export async function loadVehicles(): Promise<Vehicle[]> {
  if (cached) return cached;

  const primaryUrl = `${R2}/${CSV_KEY}`;
  let res = await fetch(primaryUrl);
  if (!res.ok) {
    const fallbackUrl = fallbackMediaUrl(CSV_KEY);
    if (fallbackUrl !== primaryUrl) {
      res = await fetch(fallbackUrl);
    }
  }
  if (!res.ok) {
    throw new Error(`Failed to load vehicles CSV (status ${res.status})`);
  }
  const text = await res.text();
  const rows = parseCSV(text);

  cached = rows
    .filter((row) => row["make"] && row["year"])
    .map((row) => ({
      id: row["_primaryKey"] || row["listingId"],
      stockType: row["stockType"] || "",
      year: parseInt(row["year"]) || 0,
      make: row["make"],
      model: row["model"],
      trim: row["trim"] !== "[PREMIUM]" ? row["trim"] : "",
      mileage:
        row["mileage"] && row["mileage"] !== "[PREMIUM]"
          ? parseInt(row["mileage"])
          : null,
      bodyStyle: row["bodyStyle"],
      exteriorColor: row["exteriorColor"] !== "[PREMIUM]" ? row["exteriorColor"] : "",
      interiorColor: row["interiorColor"] !== "[PREMIUM]" ? row["interiorColor"] : "",
      drivetrain: row["drivetrain"] ? normalizeDrivetrain(row["drivetrain"]) : "",
      fuelType: row["fuelType"] ? normalizeFuelType(row["fuelType"]) : "",
      imageSrc: FALLBACK_IMAGES[Math.abs(hashString(row["_primaryKey"])) % FALLBACK_IMAGES.length],
      isSpecial: row["_primaryKey"] in SPECIALS_REGISTRY,
      specialImageSrc: SPECIALS_REGISTRY[row["_primaryKey"]]
        ? SPECIAL_IMAGES[SPECIALS_REGISTRY[row["_primaryKey"]].imageIndex]
        : undefined,
      price: generatePrice(
        row["make"],
        parseInt(row["year"]) || 2020,
        row["mileage"] && row["mileage"] !== "[PREMIUM]" ? parseInt(row["mileage"]) : null,
        row["_primaryKey"]
      ),
      sellerCity: row["sellerCity"] || "",
      sellerState: row["sellerState"] || "",
    }));

  return cached;
}

export function getUniqueMakes(vehicles: Vehicle[]): string[] {
  return [...new Set(vehicles.map((v) => v.make))].sort();
}

export function getModelsForMake(vehicles: Vehicle[], make: string): string[] {
  return [...new Set(vehicles.filter((v) => v.make === make).map((v) => v.model))].sort();
}

export function getUniqueStates(vehicles: Vehicle[]): string[] {
  return [...new Set(vehicles.map((v) => v.sellerState).filter(Boolean))].sort();
}

export function getCitiesForState(vehicles: Vehicle[], state: string): string[] {
  return [
    ...new Set(
      vehicles
        .filter((v) => !state || v.sellerState === state)
        .map((v) => v.sellerCity)
        .filter(Boolean)
    ),
  ].sort();
}

export function getVehicleById(vehicles: Vehicle[], id: string | null): Vehicle | undefined {
  if (!id) return undefined;
  return vehicles.find((vehicle) => vehicle.id === id);
}

export function formatVehiclePrice(price: number): string {
  return `Est. $${price.toLocaleString()}`;
}

export function countActiveFilters(filters: VehicleFilters): number {
  let count = 0;
  if (filters.query.trim()) count++;
  if (filters.stockType) count++;
  if (filters.make) count++;
  if (filters.model) count++;
  if (filters.bodyStyle) count++;
  if (filters.fuelType) count++;
  if (filters.drivetrain) count++;
  if (filters.sellerState) count++;
  if (filters.sellerCity) count++;
  if (filters.yearMin > YEAR_MIN || filters.yearMax < YEAR_MAX) count++;
  if (filters.mileageMax > 0) count++;
  if (filters.priceMin > 0 || filters.priceMax > 0) count++;
  return count;
}

function getSearchText(vehicle: Vehicle): string {
  return [
    vehicle.year,
    vehicle.make,
    vehicle.model,
    vehicle.trim,
    vehicle.stockType,
    vehicle.bodyStyle,
    vehicle.fuelType,
    vehicle.drivetrain,
    vehicle.exteriorColor,
    vehicle.interiorColor,
    vehicle.sellerCity,
    vehicle.sellerState,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getMileageSortValue(vehicle: Vehicle, direction: "asc" | "desc"): number {
  if (vehicle.mileage !== null) return vehicle.mileage;
  if (vehicle.stockType === "New") return 0;
  return direction === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
}

export function filterVehicles(vehicles: Vehicle[], filters: VehicleFilters): Vehicle[] {
  const queryTokens = filters.query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const yearMin = Math.min(filters.yearMin, filters.yearMax);
  const yearMax = Math.max(filters.yearMin, filters.yearMax);
  const priceMin =
    filters.priceMin > 0 && filters.priceMax > 0
      ? Math.min(filters.priceMin, filters.priceMax)
      : filters.priceMin;
  const priceMax =
    filters.priceMin > 0 && filters.priceMax > 0
      ? Math.max(filters.priceMin, filters.priceMax)
      : filters.priceMax;

  return vehicles.filter((v) => {
    if (queryTokens.length > 0) {
      const searchText = getSearchText(v);
      if (!queryTokens.every((token) => searchText.includes(token))) return false;
    }
    if (filters.stockType && v.stockType !== filters.stockType) return false;
    if (filters.make && v.make !== filters.make) return false;
    if (filters.model && v.model !== filters.model) return false;
    if (filters.bodyStyle && v.bodyStyle !== filters.bodyStyle) return false;
    if (filters.fuelType && v.fuelType !== filters.fuelType) return false;
    if (filters.drivetrain && v.drivetrain !== filters.drivetrain) return false;
    if (filters.sellerState && v.sellerState !== filters.sellerState) return false;
    if (filters.sellerCity && v.sellerCity !== filters.sellerCity) return false;
    if (v.year < yearMin || v.year > yearMax) return false;
    if (filters.mileageMax > 0 && v.mileage !== null && v.mileage > filters.mileageMax) return false;
    if (priceMin > 0 && v.price < priceMin) return false;
    if (priceMax > 0 && v.price > priceMax) return false;
    return true;
  });
}

export function sortVehicles(vehicles: Vehicle[], sort: VehicleSort): Vehicle[] {
  const specials = vehicles.filter(v => v.isSpecial);
  const regular  = vehicles.filter(v => !v.isSpecial);

  if (sort === "recommended") return [...specials, ...regular];

  const compareFn = (a: Vehicle, b: Vehicle): number => {
    if (sort === "price_asc")    return a.price - b.price;
    if (sort === "price_desc")   return b.price - a.price;
    if (sort === "year_desc")    return b.year - a.year;
    if (sort === "year_asc")     return a.year - b.year;
    if (sort === "mileage_asc")  return getMileageSortValue(a, "asc")  - getMileageSortValue(b, "asc");
    if (sort === "mileage_desc") return getMileageSortValue(b, "desc") - getMileageSortValue(a, "desc");
    return 0;
  };

  return [...[...specials].sort(compareFn), ...[...regular].sort(compareFn)];
}
