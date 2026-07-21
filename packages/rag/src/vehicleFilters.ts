/**
 * Extract structured filters from a natural-language query, with typo tolerance.
 * Pure function — runtime-agnostic, no DB access.
 */
import type { Vehicle, VehicleQuery, VehicleSort } from "@lume/types";
import { correctQuery, fuzzyLookup, isFuzzyMatch } from "./fuzzyMatch";
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
  yearMin?: number;
  yearMax?: number;
  mileageMax?: number;
  priceMin?: number;
  priceMax?: number;
  sort?: VehicleSort;
};

export type VehicleFilterVocabulary = {
  makes?: readonly string[];
  models?: readonly string[];
  states?: readonly string[];
  cities?: readonly string[];
};

/** Explicit visitor language that starts a new make/model-agnostic search. */
export function hasInventoryScopeResetIntent(query: string): boolean {
  return /\b(?:all\s+(?:inventory|vehicles|cars)|in\s+general|regardless\s+of\s+(?:make|brand)|forget\s+(?:about\s+)?[a-z][a-z-]*|(?:not|without|except)\s+(?:talking\s+about\s+)?(?:a\s+)?[a-z][a-z-]*|no\s+(?!more\b|less\b)(?:talking\s+about\s+)?(?:a\s+)?[a-z][a-z-]*)\b/i.test(query);
}

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

// These words establish that someone is shopping, but are never evidence for
// a particular catalog model. Without this guard, permissive typo matching
// can turn "cars" into a similarly spelled model such as "Camry".
const GENERIC_MODEL_FUZZY_TOKENS = new Set(
  VEHICLE_INTENT_KEYWORDS.flatMap((keyword) => normalizePhrase(keyword).split(" ")),
);
const MODEL_FUZZY_STOPWORDS = new Set([
  ...GENERIC_MODEL_FUZZY_TOKENS,
  "a", "an", "the", "and", "or", "but", "for", "from", "to", "than", "then",
  "in", "on", "at", "near", "around", "with", "without", "that", "this", "these",
  "those", "it", "one", "ones", "all", "any", "only", "show", "find", "have",
  "got", "looking", "spend",
  "first", "second", "third", "last",
  "new", "newer", "older", "later", "earlier", "between", "under", "above", "below",
  "more", "less", "over", "up", "max", "min", "grand", "thousand", "large",
]);
const SPOKEN_PRICE_WORD_VALUES: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
  forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const SPOKEN_PRICE_PART = "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|and)";
const SPOKEN_PRICE_AMOUNT = `${SPOKEN_PRICE_PART}(?:[\\s-]+${SPOKEN_PRICE_PART}){0,3}`;

export function isVehicleQuery(
  query: string,
  vocabulary: VehicleFilterVocabulary = {},
): boolean {
  const q = normalizePhrase(query);
  return (
    VEHICLE_INTENT_KEYWORDS.some((keyword) =>
      containsPhrase(q, normalizePhrase(keyword))
    ) ||
    canonicalMakeFromText(query) !== null ||
    catalogModelFromText(query, vocabulary.models ?? []) !== null
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
  // Scope-reset/negation language is evaluated before make/model lookup. A
  // phrase such as "not Toyota, in general" must never turn Toyota into the
  // next active make filter.
  const resetInventoryScope = hasInventoryScopeResetIntent(query);

  // Make matching must be grounded in the visitor's original words. The
  // generic typo corrector is intentionally broad and can turn common words
  // into vehicle terms (for example, "less" into "lexus").
  // A reset can also contain an affirmative replacement: "not Toyota, show
  // BMWs instead" must clear Toyota while keeping BMW. Only the explicitly
  // negated term is excluded; the rest of the visitor's message still counts.
  const canonicalMake = resetInventoryScope
    ? canonicalAffirmativeMakeFromText(query)
    : canonicalMakeFromText(query);
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
          filters.bodyStyle = formatBodyStyle(bodyStyle);
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

  // The typo corrector can mistake the conjunction "and" for AWD. Model
  // year language must therefore be read from the visitor's original words.
  Object.assign(filters, extractYearRange(query));
  const sort = extractVehicleSort(query);
  if (sort) filters.sort = sort;

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
    if (
      normalizedModel.length >= 2 &&
      ((resetInventoryScope
        ? containsAffirmativePhrase(normalizedQuery, normalizedModel)
        : containsPhrase(normalizedQuery, normalizedModel)) ||
        (!normalizedModel.endsWith("s") &&
          (resetInventoryScope
            ? containsAffirmativePhrase(normalizedQuery, `${normalizedModel}s`)
            : containsPhrase(normalizedQuery, `${normalizedModel}s`))))
    ) {
      filters.model = model;
      break;
    }
  }
  if (!filters.model && !resetInventoryScope) {
    const catalogModel = catalogModelFromText(query, models);
    if (catalogModel) filters.model = catalogModel;
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
    ...(filters.year === undefined && filters.yearMin !== undefined
      ? { yearMin: filters.yearMin }
      : {}),
    ...(filters.year === undefined && filters.yearMax !== undefined
      ? { yearMax: filters.yearMax }
      : {}),
    ...(filters.mileageMax !== undefined
      ? { mileageMax: filters.mileageMax }
      : {}),
    ...(filters.priceMin !== undefined ? { priceMin: filters.priceMin } : {}),
    ...(filters.priceMax !== undefined ? { priceMax: filters.priceMax } : {}),
    ...(filters.sort ? { sort: filters.sort } : {}),
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
 * "only AWD ones" or "in Florida". Visitors naturally refine one facet at
 * a time; retaining the rest of the last search avoids silently broadening a
 * high-intent request. An explicitly named make starts a new search, while
 * every explicitly supplied current facet replaces that same prior facet.
 */
export function inheritVehicleFilterContext(
  current: VehicleQueryFilters,
  previous: VehicleQueryFilters | null | undefined,
): VehicleQueryFilters {
  if (!previous) return current;

  // Naming a make is the clearest visitor signal that they have started a
  // different search ("what about Mercedes?"). Do not accidentally carry a
  // previous BMW model, price, or location into it.
  if (current.make) return current;

  // Preserve the existing search and overlay the current visitor language.
  // This makes a sequence such as "BMW SUVs under 70k" → "only AWD ones"
  // mean BMW + SUV + under 70k + AWD, instead of dropping the earlier scope.
  return { ...previous, ...current };
}

/**
 * Reconstruct the active shopping scope from consecutive visitor turns. This
 * is based only on visitor-authored text, so assistant prose and model tool
 * arguments can never introduce constraints into the next inventory search.
 */
export function composeVehicleFilterHistory(
  queries: readonly string[],
  vocabulary: VehicleFilterVocabulary = {},
): VehicleQueryFilters | null {
  let active: VehicleQueryFilters | null = null;
  for (const query of queries) {
    const next = extractVehicleFilters(query, [], vocabulary);
    if (!hasVehicleFilterConstraint(next)) continue;
    active = inheritVehicleFilterContext(next, active);
  }
  return active;
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
  if (filters.year === undefined && filters.yearMin !== undefined) {
    results = results.filter((vehicle) => vehicle.year >= filters.yearMin!);
  }
  if (filters.year === undefined && filters.yearMax !== undefined) {
    results = results.filter((vehicle) => vehicle.year <= filters.yearMax!);
  }
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
  if (filters.sort === "price_desc" || /most expensive|highest price|priciest|most valuable/.test(q)) {
    results = [...results].sort((a, b) => b.price - a.price);
  } else if (filters.sort === "price_asc" || /cheapest|least expensive|lowest price|most affordable|budget/.test(q)) {
    results = [...results].sort((a, b) => a.price - b.price);
  } else if (filters.sort === "year_desc") {
    results = [...results].sort((a, b) => b.year - a.year);
  } else if (filters.sort === "year_asc") {
    results = [...results].sort((a, b) => a.year - b.year);
  } else if (filters.sort === "mileage_asc") {
    results = [...results].sort((a, b) => (a.mileage ?? Infinity) - (b.mileage ?? Infinity));
  } else if (filters.sort === "mileage_desc") {
    results = [...results].sort((a, b) => (b.mileage ?? -1) - (a.mileage ?? -1));
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

  // A visitor who writes "ferarri", "merceds", or "bmww" is still
  // expressing a clear make intent. Restrict fuzzy matching to a whole token
  // and require an unambiguous alias match so ordinary prose cannot become a
  // fabricated inventory filter.
  const fuzzyCandidates = new Set<string>();
  for (const token of normalized.split(" ")) {
    if (
      token.length < 3 ||
      /^\d+$/.test(token) ||
      MODEL_FUZZY_STOPWORDS.has(token)
    ) continue;
    for (const { canonical, alias } of aliases) {
      // A model name must never become a make through a loose alias match:
      // e.g. "Camry" is two edits from Cadillac's "caddy" alias. Requiring
      // the first three characters to agree still accepts ordinary make
      // typos such as "ferarri", "porche", and "bmww".
      if (
        alias.length < 3 ||
        token.slice(0, 3) !== alias.slice(0, 3) ||
        !isFuzzyMatch(token, alias)
      ) continue;
      fuzzyCandidates.add(canonical);
    }
  }
  if (fuzzyCandidates.size === 1) return [...fuzzyCandidates][0] ?? null;

  return null;
}

/**
 * Finds an explicitly named make that is not being rejected by the visitor.
 * This deliberately uses exact aliases only: when correcting scope, an
 * unambiguous stated make is safer than a fuzzy guess.
 */
function canonicalAffirmativeMakeFromText(value: string): string | null {
  const normalized = normalizePhrase(value);
  const aliases = Object.entries(MAKE_ALIASES)
    .flatMap(([canonical, values]) =>
      [canonical, ...values].map((alias) => ({
        canonical,
        alias: normalizePhrase(alias),
      }))
    )
    .sort((left, right) => right.alias.length - left.alias.length);

  const matches: Array<{ canonical: string; index: number }> = [];
  for (const { canonical, alias } of aliases) {
    let start = 0;
    while (start < normalized.length) {
      const index = normalized.indexOf(alias, start);
      if (index < 0) break;
      const before = index === 0 ? " " : normalized[index - 1] ?? " ";
      const after = normalized[index + alias.length] ?? " ";
      const pluralSuffix =
        after === "s" &&
        !alias.endsWith("s") &&
        !/[a-z0-9]/.test(normalized[index + alias.length + 1] ?? " ");
      if (!/[a-z0-9]/.test(before) && (!/[a-z0-9]/.test(after) || pluralSuffix)) {
        matches.push({ canonical, index });
      }
      start = index + alias.length;
    }
  }
  return matches
    .sort((left, right) => left.index - right.index)
    .find(({ index }) => !isNegatedTermAt(normalized, index))
    ?.canonical ?? null;
}

function containsAffirmativePhrase(normalizedText: string, phrase: string): boolean {
  let start = 0;
  while (start < normalizedText.length) {
    const index = normalizedText.indexOf(phrase, start);
    if (index < 0) return false;
    const before = index === 0 ? " " : normalizedText[index - 1] ?? " ";
    const after = normalizedText[index + phrase.length] ?? " ";
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after) && !isNegatedTermAt(normalizedText, index)) {
      return true;
    }
    start = index + phrase.length;
  }
  return false;
}

function isNegatedTermAt(normalizedText: string, termIndex: number): boolean {
  const preceding = normalizedText.slice(Math.max(0, termIndex - 40), termIndex);
  return /\b(?:not|no|without|except|other than)(?:\s+(?:talking|speaking|about|a|an|the))*\s*$/i.test(preceding);
}

/**
 * Resolve a catalog model from exact wording or one unambiguous typo. Models
 * are tenant vocabulary, not a global guess: this lets "cayene" work while
 * refusing to turn everyday prose into a model filter. Short/numeric model
 * names (X5, 911, i4) remain exact-only.
 */
function catalogModelFromText(
  query: string,
  catalogModels: readonly string[],
): string | null {
  const normalizedQuery = normalizePhrase(query);
  const tokens = normalizedQuery.split(" ").filter(Boolean);
  const compactWindows = tokenWindows(tokens, 3).map((window) => window.join(""));
  const fuzzyCandidates = new Set<string>();

  for (const model of uniqueTerms(catalogModels)) {
    const normalizedModel = normalizePhrase(model);
    if (!normalizedModel) continue;
    if (
      containsPhrase(normalizedQuery, normalizedModel) ||
      (!normalizedModel.endsWith("s") &&
        containsPhrase(normalizedQuery, `${normalizedModel}s`))
    ) {
      return model;
    }

    // Treat harmless separators in model codes as interchangeable: "X 3",
    // "X-3", and "X3" should all find a catalog model named X3.
    const compactModel = normalizedModel.replace(/\s/g, "");
    if (
      compactModel.length >= 2 &&
      compactWindows.some(
        (window) =>
          window === compactModel ||
          (!compactModel.endsWith("s") && window === `${compactModel}s`),
      )
    ) {
      return model;
    }

    // Only fuzzy-match one-word, alphabetic model names of a meaningful
    // length. This avoids unsafe guesses for short catalog codes such as X5.
    if (!/^[a-z]{4,}$/.test(normalizedModel)) continue;
    if (
      tokens.some(
        (token) =>
          !MODEL_FUZZY_STOPWORDS.has(token) &&
          // Require the first three characters to agree, exactly as the make
          // fuzzy path does. Otherwise a different word two edits away — e.g.
          // "caddy" (Cadillac) → "Camry" — becomes a fabricated model filter.
          // Ordinary model typos ("camri", "cayene") still share the prefix.
          token.slice(0, 3) === normalizedModel.slice(0, 3) &&
          isFuzzyMatch(token, normalizedModel),
      )
    ) {
      fuzzyCandidates.add(model);
    }
  }

  return fuzzyCandidates.size === 1 ? [...fuzzyCandidates][0] ?? null : null;
}

function tokenWindows(tokens: readonly string[], maximumLength: number): string[][] {
  const windows: string[][] = [];
  for (let start = 0; start < tokens.length; start += 1) {
    for (let length = 1; length <= maximumLength && start + length <= tokens.length; length += 1) {
      windows.push(tokens.slice(start, start + length));
    }
  }
  return windows;
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

function formatBodyStyle(value: string): string {
  return value === "suv"
    ? "SUV"
    : value.charAt(0).toUpperCase() + value.slice(1);
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

function extractVehicleSort(query: string): VehicleSort | undefined {
  const normalized = normalizePhrase(query);
  if (/\b(?:cheapest|least expensive|lowest price|most affordable|best price)\b/.test(normalized)) {
    return "price_asc";
  }
  if (/\b(?:most expensive|highest price|priciest|most valuable)\b/.test(normalized)) {
    return "price_desc";
  }
  if (/\b(?:newest|latest|most recent)\b/.test(normalized)) return "year_desc";
  if (/\b(?:oldest|earliest)\b/.test(normalized)) return "year_asc";
  if (/\b(?:lowest mileage|least miles|fewest miles)\b/.test(normalized)) {
    return "mileage_asc";
  }
  if (/\b(?:highest mileage|most miles)\b/.test(normalized)) {
    return "mileage_desc";
  }
  return undefined;
}

/**
 * Resolve ordinary model-year language without conflating it with a sticker
 * price. Exact years retain the existing one-year behavior; ranges and
 * relative language become inclusive bounds suitable for the inventory API.
 */
function extractYearRange(
  query: string,
): Pick<VehicleQueryFilters, "year" | "yearMin" | "yearMax"> {
  const range = /\b(?:between|from)\s+(20\d{2})\s*(?:and|to|through|[-–—])\s+(20\d{2})\b|\b(20\d{2})\s*(?:to|through|[-–—])\s*(20\d{2})\b/i.exec(query);
  if (range) {
    const first = Number(range[1] ?? range[3]);
    const second = Number(range[2] ?? range[4]);
    if (Number.isInteger(first) && Number.isInteger(second)) {
      return { yearMin: Math.min(first, second), yearMax: Math.max(first, second) };
    }
  }

  const newer = /\b(?:newer than|after)\s+(20\d{2})\b|\b(20\d{2})\s*(?:or|and)\s+(?:newer|later)\b|\b(20\d{2})\s*\+(?:\b|$)/i.exec(query);
  if (newer) {
    const strict = newer[1];
    const year = Number(strict ?? newer[2] ?? newer[3]);
    if (Number.isInteger(year)) return { yearMin: strict ? year + 1 : year };
  }

  const older = /\b(?:older than|before)\s+(20\d{2})\b|\b(20\d{2})\s*(?:or|and)\s+(?:older|earlier)\b/i.exec(query);
  if (older) {
    const strict = older[1];
    const year = Number(strict ?? older[2]);
    if (Number.isInteger(year)) return { yearMax: strict ? year - 1 : year };
  }

  const exact = /\b(20\d{2})\b/.exec(query);
  return exact ? { year: Number(exact[1]) } : {};
}

function extractPriceRange(
  rawQuery: string,
): Pick<VehicleQueryFilters, "priceMin" | "priceMax"> {
  const query = normalizeSpokenPriceAmounts(rawQuery);
  const explicitRange = extractExplicitPriceRange(query);
  if (explicitRange) return explicitRange;

  const approximateRange = extractApproximatePriceRange(query);
  if (approximateRange) return approximateRange;

  const budget = extractBudgetMaximum(query);
  if (budget !== null) return { priceMax: budget };

  const comparison = /\b(no more than|not more than|no greater than|less than or equal to|under|below|less than|up to|at most|within|max(?:imum)?(?: of)?|cap(?:ped)? at|over|above|more than|at least|min(?:imum)?)\s+\$?\s*([\d][\d,\s]*(?:\.\d+)?)\s*(k|m|grand|thousand|large)?\b/gi;
  for (const match of query.matchAll(comparison)) {
    const end = (match.index ?? 0) + match[0].length;
    if (/^\s*(?:miles?|mi)\b/i.test(query.slice(end))) continue;
    const hasVehiclePriceContext =
      canonicalMakeFromText(query) !== null ||
      /\b(?:car|cars|vehicle|vehicles|inventory|stock|price|budget|cost)\b/i.test(query);
    const rawAmount = Number((match[2] ?? "").replace(/[\s,]/g, ""));
    const amount = parsePriceRangeNumber(
      match[2] ?? "",
      match[3],
      hasVehiclePriceContext || match[0].includes("$") || (rawAmount > 0 && rawAmount < 1_000),
    );
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
    return /^(?:no more than|not more than|no greater than|less than or equal to|under|below|less than|up to|at most|within|max(?:imum)?(?: of)?|cap(?:ped)? at)$/.test(
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

function normalizeSpokenPriceAmounts(query: string): string {
  const unit = "(?:k|grand|thousand|large|dollars?)";
  const range = new RegExp(
    `\\b(${SPOKEN_PRICE_AMOUNT})\\s+(?:and|to)\\s+(${SPOKEN_PRICE_AMOUNT})\\s+(?=${unit}\\b)`,
    "gi",
  );
  const withUnit = new RegExp(
    `\\b(${SPOKEN_PRICE_AMOUNT})\\s+(?=${unit}\\b)`,
    "gi",
  );
  return query
    .replace(range, (_match, first: string, second: string) => {
      const firstAmount = spokenPriceAmount(first);
      const secondAmount = spokenPriceAmount(second);
      return firstAmount === null || secondAmount === null
        ? _match
        : `${firstAmount} and ${secondAmount}`;
    })
    .replace(withUnit, (_match, value: string) => {
      const amount = spokenPriceAmount(value);
      return amount === null ? _match : String(amount);
    });
}

function spokenPriceAmount(value: string): number | null {
  let amount = 0;
  for (const word of value.toLowerCase().split(/[\s-]+/)) {
    if (word === "and") continue;
    if (word === "hundred") {
      amount = (amount || 1) * 100;
      continue;
    }
    const part = SPOKEN_PRICE_WORD_VALUES[word];
    if (part === undefined) return null;
    amount += part;
  }
  return amount > 0 ? amount : null;
}

/**
 * "Around 50k" is a preference, not an exact sticker-price request. Use a
 * modest ±10% band so results remain useful without silently broadening into
 * a different budget. The model receives the applied bounds in its grounded
 * inventory block and can state them transparently.
 */
function extractApproximatePriceRange(
  query: string,
): Pick<VehicleQueryFilters, "priceMin" | "priceMax"> | null {
  const match = /\b(?:around|about|roughly|approximately)\s+\$?\s*([\d][\d,\s]*(?:\.\d+)?)\s*(k|m|grand|thousand|large)?(?:-?ish)?\b|\$\s*([\d][\d,\s]*(?:\.\d+)?)\s*(k|m|grand|thousand|large)?-?ish\b/i.exec(query);
  if (!match) return null;
  const value = match[1] ?? match[3] ?? "";
  const unit = match[2] ?? match[4];
  const rawAmount = Number(value.replace(/[\s,]/g, ""));
  const hasVehiclePriceContext =
    canonicalMakeFromText(query) !== null ||
    /\b(?:car|cars|vehicle|vehicles|inventory|stock|price|budget|cost)\b/i.test(query);
  const amount = parsePriceRangeNumber(
    value,
    unit,
    Boolean(unit) || hasVehiclePriceContext || rawAmount > 0 && rawAmount < 1_000,
  );
  if (amount === null || (amount >= 1900 && amount <= 2099 && !unit)) return null;
  const tolerance = Math.round(amount * 0.1);
  return { priceMin: Math.max(0, amount - tolerance), priceMax: amount + tolerance };
}

function extractBudgetMaximum(query: string): number | null {
  const patterns = [
    /\b(?:budget(?:\s+(?:is|of|around|about))?|spend(?:ing)?(?:\s+(?:up to|under|below))?)\s*\$?\s*([\d][\d,\s]*(?:\.\d+)?)\s*(k|m|grand|thousand|large)?\b/i,
    /\b(?:i(?:\s+am|'m)?\s+)?(?:have|got)\s+(?:a\s+)?(?:about\s+)?\$?\s*([\d][\d,\s]*(?:\.\d+)?)\s*(k|m|grand|thousand|large)?\s+budget\b/i,
    /\b(?:looking\s+to\s+)?spend\s+\$?\s*([\d][\d,\s]*(?:\.\d+)?)\s*(k|m|grand|thousand|large)?\b/i,
    /\b(?:i(?:\s+am|'m)?\s+)?(?:have|got)\s+(?:about\s+)?\$?\s*([\d][\d,\s]*(?:\.\d+)?)\s*(k|m|grand|thousand|large)?\s+(?:to spend|available|set aside|all in)\b/i,
    /\b(?:my\s+)?(?:max(?:imum)?|ceiling|cap)\s*(?:is|of|at)?\s*\$?\s*([\d][\d,\s]*(?:\.\d+)?)\s*(k|m|grand|thousand|large)?\b/i,
  ];
  const match = patterns.map((pattern) => pattern.exec(query)).find(Boolean);
  if (!match) return null;
  const rawAmount = Number((match[1] ?? "").replace(/[\s,]/g, ""));
  const amount = parsePriceRangeNumber(
    match[1] ?? "",
    match[2],
    rawAmount > 0 && rawAmount < 1_000,
  );
  if (amount === null || (amount >= 1900 && amount <= 2099 && !match[2])) {
    return null;
  }
  return amount;
}

/**
 * People naturally omit currency symbols: "BMWs between 40k and 55k",
 * "from 30 grand to 70 grand", or "40–55k BMWs". Recognize those range
 * forms before the single-price fallback. Bare small values are interpreted
 * as thousands only in a clear inventory/price context; years and mileage
 * ranges therefore remain untouched.
 */
function extractExplicitPriceRange(
  query: string,
): Pick<VehicleQueryFilters, "priceMin" | "priceMax"> | null {
  const token = "\\$?\\s*([\\d][\\d,\\s]*(?:\\.\\d+)?)\\s*(k|m|grand|thousand)?";
  const patterns = [
    new RegExp(`\\b(?:between|btwn|from)\\s+${token}\\s*(?:and|to|through|[-–—])\\s+${token}\\b`, "i"),
    new RegExp(`\\b${token}\\s*(?:to|through|[-–—])\\s*${token}\\b`, "i"),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(query);
    if (!match) continue;
    const [firstValue, firstUnit, secondValue, secondUnit] =
      match.length === 5
        ? [match[1], match[2], match[3], match[4]]
        : [undefined, undefined, undefined, undefined];
    if (!firstValue || !secondValue) continue;
    const matchedText = match[0] ?? "";
    const hasExplicitMoney =
      /\$|\b(?:grand|thousand|usd|dollars?)\b/i.test(matchedText) ||
      Boolean(firstUnit || secondUnit);
    const hasVehiclePriceContext =
      canonicalMakeFromText(query) !== null ||
      /\b(?:car|cars|vehicle|vehicles|inventory|stock|price|budget|cost)\b/i.test(query);
    const first = parsePriceRangeNumber(
      firstValue,
      firstUnit,
      hasExplicitMoney || hasVehiclePriceContext,
    );
    const second = parsePriceRangeNumber(
      secondValue,
      secondUnit,
      hasExplicitMoney || hasVehiclePriceContext,
    );
    if (first === null || second === null) continue;

    // 2019–2021 is a year range, not a price range. Nor should an unmarked
    // range such as "between 40 and 55" be treated as money without an
    // inventory cue.
    if (
      (!hasExplicitMoney && !hasVehiclePriceContext) ||
      (first >= 1900 && first <= 2099 && second >= 1900 && second <= 2099)
    ) {
      continue;
    }
    return { priceMin: Math.min(first, second), priceMax: Math.max(first, second) };
  }
  return null;
}

function parsePriceRangeNumber(
  value: string,
  unit: string | undefined,
  allowImplicitThousands: boolean,
): number | null {
  const parsed = Number(value.replace(/[\s,]/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  const normalizedUnit = unit?.toLowerCase();
  if (normalizedUnit === "m") return Math.round(parsed * 1_000_000);
  if (
    normalizedUnit === "k" ||
    normalizedUnit === "grand" ||
    normalizedUnit === "thousand" ||
    normalizedUnit === "large"
  ) {
    return Math.round(parsed * 1_000);
  }
  if (allowImplicitThousands && parsed > 0 && parsed < 1_000) {
    return Math.round(parsed * 1_000);
  }
  return Math.round(parsed);
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
  const parsed = Number(value.replace(/[\s,]/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  const normalizedSuffix = suffix?.toLowerCase();
  const multiplier = normalizedSuffix === "m"
    ? 1_000_000
    : normalizedSuffix === "k" || normalizedSuffix === "grand" || normalizedSuffix === "thousand" || normalizedSuffix === "large"
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
