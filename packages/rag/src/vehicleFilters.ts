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
  mileageMax?: number;
  priceMin?: number;
  priceMax?: number;
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

  // Make matching must be grounded in the visitor's original words. The
  // generic typo corrector is intentionally broad and can turn common words
  // into vehicle terms (for example, "less" into "lexus").
  const canonicalMake = canonicalMakeFromText(query);
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

  const drivetrain = exactAliasFromText(query, DRIVETRAIN_ALIASES);
  if (drivetrain) {
    filters.drivetrain = drivetrain.toUpperCase();
  }

  const yearMatch = q.match(/\b(20\d{2})\b/);
  if (yearMatch) filters.year = parseInt(yearMatch[1]);

  const priceRange = extractPriceRange(query);
  if (priceRange.priceMin !== undefined) filters.priceMin = priceRange.priceMin;
  if (priceRange.priceMax !== undefined) filters.priceMax = priceRange.priceMax;

  const mileageMax = extractMileageMaximum(query);
  if (mileageMax !== null) filters.mileageMax = mileageMax;

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
    if (matchesCatalogState(query, state)) {
      filters.sellerState = state;
      break;
    }
  }
  if (!filters.sellerState) {
    for (const [name, abbreviation] of Object.entries(US_STATE_NAMES)) {
      if (containsPhrase(normalizePhrase(query), name)) {
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
    const normalizedCity = normalizePhrase(city);
    if (
      normalizedCity.length >= 3 &&
      containsPhrase(normalizePhrase(query), normalizedCity)
    ) {
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
    ...(filters.mileageMax !== undefined
      ? { mileageMax: filters.mileageMax }
      : {}),
    ...(filters.priceMin !== undefined ? { priceMin: filters.priceMin } : {}),
    ...(filters.priceMax !== undefined ? { priceMax: filters.priceMax } : {}),
  };
}

/**
 * Keep the current visitor message authoritative over model-authored tool
 * arguments. The model may choose presentation controls, but it cannot add a
 * make, model, year, location, or numeric constraint absent from the message.
 */
export function mergeTrustedVehicleQuery(
  modelQuery: VehicleQuery,
  trustedFilters: VehicleQuery,
): VehicleQuery {
  return {
    ...(modelQuery.sort ? { sort: modelQuery.sort } : {}),
    ...(modelQuery.limit !== undefined ? { limit: modelQuery.limit } : {}),
    ...trustedFilters,
  };
}

export function hasVehicleFilterConstraint(
  filters: VehicleQueryFilters,
): boolean {
  return Object.values(filters).some((value) => value !== undefined);
}

/**
 * Carry trusted visitor-authored scope into a short refinement such as
 * "for less than $40k?". Explicit scope in the current message wins and
 * numeric bounds never leak forward from an older request.
 */
export function inheritVehicleFilterContext(
  current: VehicleQueryFilters,
  previous: VehicleQueryFilters | null | undefined,
): VehicleQueryFilters {
  if (!previous) return current;

  if (current.make) return current;

  const inherited: VehicleQueryFilters = {
    ...current,
    ...(previous.make ? { make: previous.make } : {}),
  };

  const hasCurrentScope =
    current.model !== undefined ||
    current.bodyStyle !== undefined ||
    current.stockType !== undefined ||
    current.fuelType !== undefined ||
    current.drivetrain !== undefined ||
    current.sellerState !== undefined ||
    current.sellerCity !== undefined ||
    current.year !== undefined;

  if (!hasCurrentScope && previous.model) {
    inherited.model = previous.model;
  }

  return inherited;
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
  if (filters.mileageMax !== undefined) {
    results = results.filter(
      (vehicle) =>
        vehicle.mileage !== null && vehicle.mileage <= filters.mileageMax!,
    );
  }
  if (filters.priceMin !== undefined) {
    results = results.filter((vehicle) => vehicle.price >= filters.priceMin!);
  }
  if (filters.priceMax !== undefined) {
    results = results.filter((vehicle) => vehicle.price <= filters.priceMax!);
  }

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

  return null;
}

function exactAliasFromText<T extends string>(
  value: string,
  aliasesByCanonical: Record<T, string[]>,
): T | null {
  const normalized = normalizePhrase(value);
  const aliases = (
    Object.entries(aliasesByCanonical) as Array<[T, string[]]>
  )
    .flatMap(([canonical, aliases]) =>
      aliases.map((alias) => ({
        canonical,
        alias: normalizePhrase(alias),
      })),
    )
    .sort((left, right) => right.alias.length - left.alias.length);

  return aliases.find(({ alias }) => containsPhrase(normalized, alias))
    ?.canonical ?? null;
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

function matchesCatalogState(query: string, state: string): boolean {
  const trimmed = state.trim();
  if (!trimmed) return false;
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    const abbreviation = escapeRegExp(trimmed.toUpperCase());
    // Two-letter state codes overlap with ordinary language ("me", "in",
    // "or"). Require an explicitly upper-case code in location context.
    return new RegExp(
      `(?:\\b(?:in|near|around|from)\\s+|,\\s*)${abbreviation}\\b`,
    ).test(query);
  }
  return containsPhrase(normalizePhrase(query), normalizePhrase(trimmed));
}

function extractPriceRange(
  query: string,
): Pick<VehicleQueryFilters, "priceMin" | "priceMax"> {
  const comparison = /\b(under|below|less than|up to|at most|max(?:imum)?|over|above|more than|at least|min(?:imum)?)\s+\$?\s*([\d][\d,]*(?:\.\d+)?)\s*([km])?\b/gi;
  for (const match of query.matchAll(comparison)) {
    const end = (match.index ?? 0) + match[0].length;
    if (/^\s*(?:miles?|mi)\b/i.test(query.slice(end))) continue;
    const amount = parseAbbreviatedNumber(match[2] ?? "", match[3]);
    if (amount === null) continue;
    if (
      !match[0].includes("$") &&
      !match[3] &&
      amount >= 1900 &&
      amount <= 2099
    ) {
      continue;
    }
    const direction = (match[1] ?? "").toLowerCase();
    return /^(?:under|below|less than|up to|at most|max(?:imum)?)$/.test(
      direction,
    )
      ? { priceMax: amount }
      : { priceMin: amount };
  }

  const amounts = [...query.matchAll(
    /(?:\$\s*([\d][\d,]*(?:\.\d+)?)\s*([km])?|([\d][\d,]*(?:\.\d+)?)\s*([km])?\s*(?:usd|dollars?))/gi,
  )].flatMap((match) => {
    const amount = parseAbbreviatedNumber(
      match[1] ?? match[3] ?? "",
      match[2] ?? match[4],
    );
    return amount === null
      ? []
      : [{ amount, index: match.index ?? 0, length: match[0].length }];
  });
  if (amounts.length === 0) return {};

  if (amounts.length >= 2) {
    const betweenPrefix = query
      .slice(Math.max(0, amounts[0]!.index - 20), amounts[0]!.index)
      .toLowerCase();
    const separator = query
      .slice(
        amounts[0]!.index + amounts[0]!.length,
        amounts[1]!.index,
      )
      .toLowerCase();
    if (
      /\bbetween\s*$/.test(betweenPrefix) &&
      /^\s*(?:and|to|-)\s*$/.test(separator)
    ) {
      return {
        priceMin: Math.min(amounts[0]!.amount, amounts[1]!.amount),
        priceMax: Math.max(amounts[0]!.amount, amounts[1]!.amount),
      };
    }
  }

  const first = amounts[0]!;
  const prefix = query
    .slice(Math.max(0, first.index - 36), first.index)
    .toLowerCase();
  if (/\b(?:under|below|less than|up to|at most|max(?:imum)?)\s*$/.test(prefix)) {
    return { priceMax: first.amount };
  }
  if (/\b(?:over|above|more than|at least|min(?:imum)?|from)\s*$/.test(prefix)) {
    return { priceMin: first.amount };
  }
  return { priceMin: first.amount, priceMax: first.amount };
}

function extractMileageMaximum(query: string): number | null {
  const match =
    /\b([\d][\d,]*(?:\.\d+)?)\s*([km])?\s*(?:miles?|mi)\b/i.exec(query);
  return match
    ? parseAbbreviatedNumber(match[1] ?? "", match[2])
    : null;
}

function parseAbbreviatedNumber(
  value: string,
  suffix?: string,
): number | null {
  const parsed = Number(value.replace(/,/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  const multiplier = suffix?.toLowerCase() === "m"
    ? 1_000_000
    : suffix?.toLowerCase() === "k"
      ? 1_000
      : 1;
  return Math.round(parsed * multiplier);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniqueTerms(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
