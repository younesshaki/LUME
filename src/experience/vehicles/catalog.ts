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
};

export type VehicleFilters = {
  stockType: string;
  make: string;
  model: string;
  bodyStyle: string;
  fuelType: string;
  drivetrain: string;
  yearMin: number;
  yearMax: number;
  mileageMax: number;
};

export const YEAR_MIN = 2003;
export const YEAR_MAX = 2027;

export const DEFAULT_FILTERS: VehicleFilters = {
  stockType: "",
  make: "",
  model: "",
  bodyStyle: "",
  fuelType: "",
  drivetrain: "",
  yearMin: YEAR_MIN,
  yearMax: YEAR_MAX,
  mileageMax: 0,
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

const FALLBACK_IMAGES = [
  "/vehicles/vehicle-type-1.webp",
  "/vehicles/vehicle-type-2.webp",
  "/vehicles/vehicle-type-3.webp",
  "/vehicles/vehicle-type-4.webp",
  "/vehicles/vehicle-type-5.webp",
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

  const res = await fetch("/vehicles/vehicles-with-generated-images.csv");
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

export function countActiveFilters(filters: VehicleFilters): number {
  let count = 0;
  if (filters.stockType) count++;
  if (filters.make) count++;
  if (filters.model) count++;
  if (filters.bodyStyle) count++;
  if (filters.fuelType) count++;
  if (filters.drivetrain) count++;
  if (filters.yearMin > YEAR_MIN || filters.yearMax < YEAR_MAX) count++;
  if (filters.mileageMax > 0) count++;
  return count;
}

export function filterVehicles(vehicles: Vehicle[], filters: VehicleFilters): Vehicle[] {
  return vehicles.filter((v) => {
    if (filters.stockType && v.stockType !== filters.stockType) return false;
    if (filters.make && v.make !== filters.make) return false;
    if (filters.model && v.model !== filters.model) return false;
    if (filters.bodyStyle && v.bodyStyle !== filters.bodyStyle) return false;
    if (filters.fuelType && v.fuelType !== filters.fuelType) return false;
    if (filters.drivetrain && v.drivetrain !== filters.drivetrain) return false;
    if (v.year < filters.yearMin || v.year > filters.yearMax) return false;
    if (filters.mileageMax > 0 && v.mileage !== null && v.mileage > filters.mileageMax) return false;
    return true;
  });
}
