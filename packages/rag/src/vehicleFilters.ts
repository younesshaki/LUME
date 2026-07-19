/**
 * Extract structured filters from a natural-language query, with typo tolerance.
 * Pure function — runtime-agnostic, no DB access.
 */
import type { Vehicle, VehicleQuery } from "@lume/types";
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

export type VehicleFilterVocabulary = {
  makes?: readonly string[];
  models?: readonly string[];
  states?: readonly string[];
  cities?: readonly string[];
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
  const q = normalizePhrase(query);
  return (
    VEHICLE_INTENT_KEYWORDS.some((keyword) =>
      containsPhrase(q, normalizePhrase(keyword))
    ) ||
    canonicalMakeFromText(query) !== null
  );
}

export function extractVehicleFilters(
  query: string,
  vehicles: readonly Vehicle[] = [],
  vocabulary: VehicleFilterVocabulary = {},
): VehicleQueryFilters {
  const { corrected } = correctQuery(query, ALL_KNOWN_VEHICLE_TERMS);
  const q = corrected.toLowerCase();
  const filters: VehicleQueryFilters = {};
  const tokens = q.split(/\s+/);

  const canonicalMake = canonicalMakeFromText(corrected);
  if (canonicalMake) {
    const availableMakes = uniqueTerms([
      ...vehicles.map((vehicle) => vehicle.make),
      ...(vocabulary.makes ?? []),
    ]);
    filters.make =
      availableMakes.find(
        (make) => canonicalMakeFromValue(make) === canonicalMake,
      ) ?? formatCanonicalMake(canonicalMake);
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

  const models = uniqueTerms([
    ...vehicles.map((vehicle) => vehicle.model),
    ...(vocabulary.models ?? []),
  ]).sort((left, right) => right.length - left.length);
  // Use the original text for catalog-provided model names. The generic typo
  // corrector can legitimately mistake short models such as "GLC" for a make
  // acronym such as "GMC".
  const normalizedQuery = normalizePhrase(query);
  for (const model of models) {
    const normalizedModel = normalizePhrase(model);
    if (normalizedModel.length >= 2 && containsPhrase(normalizedQuery, normalizedModel)) {
      filters.model = model;
      break;
    }
  }

  const states = uniqueTerms([
    ...vehicles.map((vehicle) => vehicle.sellerState),
    ...(vocabulary.states ?? []),
  ]);
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

  const cities = uniqueTerms([
    ...vehicles.map((vehicle) => vehicle.sellerCity),
    ...(vocabulary.cities ?? []),
  ])
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

/** Translate trusted natural-language filters to the shared DB query shape. */
export function vehicleQueryFromFilters(
  filters: VehicleQueryFilters,
): VehicleQuery {
  return {
    ...(filters.make ? { make: filters.make } : {}),
    ...(filters.model ? { model: filters.model } : {}),
    ...(filters.bodyStyle ? { bodyStyle: filters.bodyStyle } : {}),
    ...(filters.stockType ? { stockType: filters.stockType } : {}),
    ...(filters.fuelType ? { fuelType: filters.fuelType } : {}),
    ...(filters.drivetrain ? { drivetrain: filters.drivetrain } : {}),
    ...(filters.sellerState ? { sellerState: filters.sellerState } : {}),
    ...(filters.sellerCity ? { sellerCity: filters.sellerCity } : {}),
    ...(filters.year !== undefined
      ? { yearMin: filters.year, yearMax: filters.year }
      : {}),
  };
}

export type VehicleMatchResult = { results: Vehicle[]; totalMatched: number };

export function matchVehicles(
  vehicles: Vehicle[],
  filters: VehicleQueryFilters,
  query: string
): VehicleMatchResult {
  let results = vehicles;

  if (filters.make) {
    const canonicalFilterMake = canonicalMakeFromValue(filters.make);
    results = results.filter((vehicle) => {
      const canonicalVehicleMake = canonicalMakeFromValue(vehicle.make);
      return canonicalFilterMake && canonicalVehicleMake
        ? canonicalVehicleMake === canonicalFilterMake
        : normalizePhrase(vehicle.make) === normalizePhrase(filters.make!);
    });
  }
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

function canonicalMakeFromText(value: string): string | null {
  const normalized = normalizePhrase(value);
  const aliases = Object.entries(MAKE_ALIASES)
    .flatMap(([canonical, values]) =>
      [canonical, ...values].map((alias) => ({
        canonical,
        alias: normalizePhrase(alias),
      }))
    )
    .sort((left, right) => right.alias.length - left.alias.length);

  for (const { canonical, alias } of aliases) {
    if (
      containsPhrase(normalized, alias) ||
      (!alias.endsWith("s") && containsPhrase(normalized, `${alias}s`))
    ) {
      return canonical;
    }
  }

  for (const token of normalized.split(" ")) {
    if (token.length <= 2) continue;
    const make = fuzzyLookup(token, MAKE_ALIASES);
    if (make) return make;
  }
  return null;
}

function canonicalMakeFromValue(value: string): string | null {
  const normalized = normalizePhrase(value);
  for (const [canonical, aliases] of Object.entries(MAKE_ALIASES)) {
    if (
      normalizePhrase(canonical) === normalized ||
      aliases.some((alias) => normalizePhrase(alias) === normalized)
    ) {
      return canonical;
    }
  }
  return null;
}

function formatCanonicalMake(canonical: string): string {
  if (canonical === "bmw" || canonical === "gmc" || canonical === "ram") {
    return canonical.toUpperCase();
  }
  return canonical.replace(/(^|[ -])([a-z])/g, (_match, separator: string, letter: string) =>
    `${separator}${letter.toUpperCase()}`
  );
}

function normalizePhrase(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function containsPhrase(haystack: string, needle: string): boolean {
  return Boolean(needle) && ` ${haystack} `.includes(` ${needle} `);
}

function uniqueTerms(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
