/**
 * Extract structured filters from a natural-language query, with typo tolerance.
 * Pure function — runtime-agnostic, no DB access.
 */
import type { Vehicle } from "@lume/types";
import { correctQuery } from "./fuzzyMatch";
import { fuzzyLookup } from "./fuzzyMatch";
import {
  ALL_KNOWN_VEHICLE_TERMS,
  BODY_STYLE_ALIASES,
  DRIVETRAIN_ALIASES,
  FUEL_TYPE_ALIASES,
  MAKE_ALIASES,
} from "./vehicleTerms";

export type VehicleQueryFilters = {
  make?: string;
  model?: string;
  bodyStyle?: string;
  stockType?: string;
  fuelType?: string;
  drivetrain?: string;
  sellerState?: string;
  sellerCity?: string;
  year?: number;
};

const US_STATE_NAMES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH",
  "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC",
  "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA",
  "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN",
  texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
  "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

const VEHICLE_INTENT_KEYWORDS = [
  "car", "cars", "vehicle", "vehicles", "truck", "trucks", "suv", "sedan", "coupe",
  "convertible", "hatchback", "wagon", "minivan", "automobile", "inventory",
  "stock", "mileage", "miles", "drivetrain", "awd", "rwd", "fwd", "4wd", "electric",
  "hybrid", "diesel", "gasoline", "new car", "used car", "pre-owned", "preowned",
  "price", "prices", "pricing", "cost", "costs", "expensive", "cheapest", "affordable",
  "most expensive", "least expensive", "highest price", "lowest price", "budget",
];

export function isVehicleQuery(query: string): boolean {
  const q = query.toLowerCase();
  return (
    VEHICLE_INTENT_KEYWORDS.some((kw) => q.includes(kw)) ||
    Object.keys(MAKE_ALIASES).some((make) => q.includes(make))
  );
}

export function extractVehicleFilters(
  query: string,
  vehicles: Vehicle[] = []
): VehicleQueryFilters {
  const { corrected } = correctQuery(query, ALL_KNOWN_VEHICLE_TERMS);
  const q = corrected.toLowerCase();
  const filters: VehicleQueryFilters = {};
  const tokens = q.split(/\s+/);

  for (const token of tokens) {
    if (token.length > 2) {
      const make = fuzzyLookup(token, MAKE_ALIASES);
      if (make) {
        filters.make = make.charAt(0).toUpperCase() + make.slice(1);
        break;
      }
    }
  }

  if (!filters.bodyStyle) {
    for (const token of tokens) {
      if (token.length > 2) {
        const bodyStyle = fuzzyLookup(token, BODY_STYLE_ALIASES);
        if (bodyStyle) {
          filters.bodyStyle = bodyStyle.charAt(0).toUpperCase() + bodyStyle.slice(1);
          break;
        }
      }
    }
  }

  if (/\bnew\b/.test(q)) filters.stockType = "New";
  else if (/\bused\b|\bpre-?owned\b/.test(q)) filters.stockType = "Used";

  if (!filters.fuelType) {
    for (const token of tokens) {
      if (token.length > 2) {
        const fuelType = fuzzyLookup(token, FUEL_TYPE_ALIASES);
        if (fuelType) {
          filters.fuelType =
            fuelType === "plug-in hybrid"
              ? "Plug-In Hybrid"
              : fuelType.charAt(0).toUpperCase() + fuelType.slice(1);
          break;
        }
      }
    }
  }

  if (!filters.drivetrain) {
    for (const token of tokens) {
      if (token.length > 1) {
        const drivetrain = fuzzyLookup(token, DRIVETRAIN_ALIASES);
        if (drivetrain) {
          filters.drivetrain = drivetrain.toUpperCase();
          break;
        }
      }
    }
  }

  const yearMatch = q.match(/\b(20\d{2})\b/);
  if (yearMatch) filters.year = parseInt(yearMatch[1]);

  const states = [...new Set(vehicles.map((v) => v.sellerState).filter(Boolean))];
  for (const state of states) {
    if (new RegExp(`\\b${state.toLowerCase()}\\b`).test(q)) {
      filters.sellerState = state;
      break;
    }
  }
  if (!filters.sellerState) {
    for (const [name, abbreviation] of Object.entries(US_STATE_NAMES)) {
      if (q.includes(name)) {
        filters.sellerState = abbreviation;
        break;
      }
    }
  }

  const cities = [...new Set(vehicles.map((v) => v.sellerCity).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  for (const city of cities) {
    const lowerCity = city.toLowerCase();
    if (lowerCity.length >= 3 && q.includes(lowerCity)) {
      filters.sellerCity = city;
      break;
    }
  }

  return filters;
}

export type VehicleMatchResult = { results: Vehicle[]; totalMatched: number };

export function matchVehicles(
  vehicles: Vehicle[],
  filters: VehicleQueryFilters,
  query: string
): VehicleMatchResult {
  let results = vehicles;

  if (filters.make) results = results.filter((v) => v.make.toLowerCase() === filters.make!.toLowerCase());
  if (filters.model) results = results.filter((v) => v.model.toLowerCase().includes(filters.model!.toLowerCase()));
  if (filters.bodyStyle) results = results.filter((v) => v.bodyStyle === filters.bodyStyle);
  if (filters.stockType) results = results.filter((v) => v.stockType === filters.stockType);
  if (filters.fuelType) results = results.filter((v) => v.fuelType === filters.fuelType);
  if (filters.drivetrain) results = results.filter((v) => v.drivetrain === filters.drivetrain);
  if (filters.sellerState) results = results.filter((v) => v.sellerState === filters.sellerState);
  if (filters.sellerCity) results = results.filter((v) => v.sellerCity.toLowerCase() === filters.sellerCity!.toLowerCase());
  if (filters.year) results = results.filter((v) => v.year === filters.year);

  const totalMatched = results.length;

  const q = query.toLowerCase();
  if (/most expensive|highest price|priciest|most valuable/.test(q)) {
    results = [...results].sort((a, b) => b.price - a.price);
  } else if (/cheapest|least expensive|lowest price|most affordable|budget/.test(q)) {
    results = [...results].sort((a, b) => a.price - b.price);
  }

  const cap = Object.keys(filters).length > 0 ? 30 : 15;
  return { results: results.slice(0, cap), totalMatched };
}
