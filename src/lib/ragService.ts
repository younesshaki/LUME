import embeddedChunks from "./knowledge/embeddings.json";
import { formatVehiclePrice, type Vehicle } from "../experience/vehicles/catalog";
import {
  levenshteinDistance,
  isFuzzyMatch,
  fuzzyLookup,
  correctQuery,
  type Correction,
} from "./fuzzyMatch";
import {
  ALL_MAKES,
  MAKE_ALIASES,
  BODY_STYLE_ALIASES,
  FUEL_TYPE_ALIASES,
  DRIVETRAIN_ALIASES,
  ALL_KNOWN_VEHICLE_TERMS,
  REVERSE_MAPS,
} from "./vehicleTerms";

type EmbeddedChunk = {
  id: string;
  text: string;
  category: string;
  embedding: number[];
};

const CHUNKS = embeddedChunks as EmbeddedChunk[];


const BASE_SYSTEM_PROMPT = `You are the LUME assistant chatbot — a specialized AI assistant for LUME, an invitation-only luxury hotel in Monaco. You are NOT Claude, ChatGPT, or any other general-purpose AI. You exist solely to answer questions about LUME.

ABOUT LUME:
LUME is an invitation-only secret luxury hotel in Monaco with approximately 70 rooms. Access is granted based on positive societal impact, not wealth — one stay per year per invited guest. LUME also includes a concept/demo vehicle marketplace for browsing new and used vehicles.

CRITICAL RULES — follow these without exception:
1. IDENTITY: You are the LUME assistant. Never claim to be Claude, ChatGPT, Deepseek, or any other AI system. If asked what you are, say: "I'm the LUME assistant, a specialized chatbot for LUME."
2. BRAND CLARITY: LUME is a luxury hotel in Monaco. It is NOT a personal care brand, NOT a deodorant brand, NOT a consumer goods company. Do not confuse it with any other brand named Lume or similar.
3. CONTEXT ONLY: Answer ONLY using the context provided below. Do not use any prior training knowledge about LUME or any other brand.
4. NOT FOUND: If the answer is not in the provided context, say: "I don't have that information — please visit lume.com or contact us directly."
5. NO HALLUCINATION: Never invent, guess, or extrapolate products, facts, or details that are not explicitly stated in the context.
6. VEHICLE ACCURACY: When the context includes a LUME VEHICLE INVENTORY section, use ONLY the vehicles listed there. Do not invent, hallucinate, or imagine vehicles. If a vehicle is not in the list, it does not exist in inventory. Always count only the vehicles provided in the inventory section.

Tone: concise, restrained, and confident — matching LUME's premium brand voice.`;

// ─── Query Preprocessing: Correct typos before extraction ──────────────────────
/**
 * Preprocess a query to correct common typos in vehicle terms.
 * Centralizes correction logic so downstream code can rely on exact matching.
 */
type PreprocessResult = {
  corrected: string;
  corrections: Correction[];
};

function preprocessQuery(query: string): PreprocessResult {
  return correctQuery(query, ALL_KNOWN_VEHICLE_TERMS);
}

const VEHICLE_INTENT_KEYWORDS = [
  "car","cars","vehicle","vehicles","truck","trucks","suv","sedan","coupe",
  "convertible","hatchback","wagon","minivan","automobile","inventory",
  "stock","mileage","miles","drivetrain","awd","rwd","fwd","4wd","electric",
  "hybrid","diesel","gasoline","new car","used car","pre-owned","preowned",
  "price","prices","pricing","cost","costs","expensive","cheapest","affordable",
  "most expensive","least expensive","highest price","lowest price","budget",
];

// ─── Detect whether the query is vehicle-related ─────────────────────────────
function isVehicleQuery(query: string): boolean {
  const q = query.toLowerCase();
  return (
    VEHICLE_INTENT_KEYWORDS.some((kw) => q.includes(kw)) ||
    ALL_MAKES.some((make) => q.includes(make))
  );
}

type VehicleQueryFilters = {
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
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
};

// ─── Extract structured filters from a natural-language query ────────────────
/**
 * Extract vehicle query filters (make, body style, fuel, drivetrain, etc.) from a query.
 * Uses fuzzy matching for typo tolerance via the vehicleTerms dictionaries.
 */
function extractVehicleFilters(query: string, vehicles: Vehicle[] = []): VehicleQueryFilters {
  // Preprocess: correct typos
  const { corrected } = preprocessQuery(query);
  const q = corrected.toLowerCase();
  const filters: VehicleQueryFilters = {};

  // Make — use fuzzyLookup for robust matching
  const make = fuzzyLookup(q, MAKE_ALIASES);
  if (make) {
    filters.make = make.charAt(0).toUpperCase() + make.slice(1);
  }

  // Body style — use fuzzyLookup
  const bodyStyle = fuzzyLookup(q, BODY_STYLE_ALIASES);
  if (bodyStyle) {
    filters.bodyStyle = bodyStyle.charAt(0).toUpperCase() + bodyStyle.slice(1);
  }

  // Stock type (not in fuzzyTerms, using original regex)
  if (/\bnew\b/.test(q)) filters.stockType = "New";
  else if (/\bused\b|\bpre-?owned\b/.test(q)) filters.stockType = "Used";

  // Fuel type — use fuzzyLookup
  const fuelType = fuzzyLookup(q, FUEL_TYPE_ALIASES);
  if (fuelType) {
    filters.fuelType =
      fuelType === "plug-in hybrid"
        ? "Plug-In Hybrid"
        : fuelType.charAt(0).toUpperCase() + fuelType.slice(1);
  }

  // Drivetrain — use fuzzyLookup
  const drivetrain = fuzzyLookup(q, DRIVETRAIN_ALIASES);
  if (drivetrain) {
    filters.drivetrain = drivetrain.toUpperCase();
  }

  // Year (e.g. "2023 BMW")
  const yearMatch = q.match(/\b(20\d{2})\b/);
  if (yearMatch) filters.year = parseInt(yearMatch[1]);

  // Location
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

// ─── Filter vehicles and return the most relevant matches ─────────────────────
type MatchResult = { results: Vehicle[]; totalMatched: number };

function matchVehicles(vehicles: Vehicle[], filters: VehicleQueryFilters, query: string): MatchResult {
  let results = vehicles;

  if (filters.make) {
    results = results.filter(
      (v) => v.make.toLowerCase() === filters.make!.toLowerCase()
    );
  }
  if (filters.model) {
    results = results.filter((v) =>
      v.model.toLowerCase().includes(filters.model!.toLowerCase())
    );
  }
  if (filters.bodyStyle) {
    results = results.filter((v) => v.bodyStyle === filters.bodyStyle);
  }
  if (filters.stockType) {
    results = results.filter((v) => v.stockType === filters.stockType);
  }
  if (filters.fuelType) {
    results = results.filter((v) => v.fuelType === filters.fuelType);
  }
  if (filters.drivetrain) {
    results = results.filter((v) => v.drivetrain === filters.drivetrain);
  }
  if (filters.sellerState) {
    results = results.filter((v) => v.sellerState === filters.sellerState);
  }
  if (filters.sellerCity) {
    results = results.filter(
      (v) => v.sellerCity.toLowerCase() === filters.sellerCity!.toLowerCase()
    );
  }
  if (filters.year) {
    results = results.filter((v) => v.year === filters.year);
  }

  const totalMatched = results.length;

  // Sort by price when query asks about cost ranking
  const q = query.toLowerCase();
  if (/most expensive|highest price|priciest|most valuable/.test(q)) {
    results = [...results].sort((a, b) => b.price - a.price);
  } else if (/cheapest|least expensive|lowest price|most affordable|budget/.test(q)) {
    results = [...results].sort((a, b) => a.price - b.price);
  }

  const cap = Object.keys(filters).length > 0 ? 30 : 15;
  return { results: results.slice(0, cap), totalMatched };
}

// ─── Format vehicle list for injection into the system prompt ─────────────────
function formatVehiclesBlock(
  matched: Vehicle[],
  totalMatched: number,
  totalInventory: number,
  filters: VehicleQueryFilters
): string {
  const isFiltered = Object.keys(filters).length > 0;
  const filterSummary = isFiltered
    ? ` matching ${Object.entries(filters).map(([k, v]) => `${k}=${v}`).join(", ")}`
    : "";
  const showingNote =
    matched.length < totalMatched
      ? `Showing first ${matched.length} of ${totalMatched} — use the TOTAL MATCHING count when answering "how many".`
      : `All ${totalMatched} shown below.`;

  const header =
    `=== LUME VEHICLE INVENTORY ===\n` +
    `Total vehicles in full inventory: ${totalInventory}\n` +
    `TOTAL MATCHING${filterSummary}: ${totalMatched}\n` +
    `${showingNote}\n`;

  const lines = matched.map((v, i) => {
    const parts = [
      `${v.year} ${v.make} ${v.model}`,
      v.trim || null,
      v.stockType,
      formatVehiclePrice(v.price),
      v.mileage !== null ? (v.mileage === 0 ? "0 mi (new)" : `${v.mileage.toLocaleString()} mi`) : null,
      v.bodyStyle || null,
      v.drivetrain || null,
      v.fuelType || null,
      v.sellerCity ? `${v.sellerCity}, ${v.sellerState}` : null,
    ].filter(Boolean);
    return `[${i + 1}] ${parts.join(" | ")}`;
  });

  return `${header}\n${lines.join("\n")}\n==============================`;
}

// ─── Keyword-based retrieval (no embeddings needed) ────────────────────────────
type ScoredChunk = {
  text: string;
  category: string;
  score: number;
};

/**
 * Score a knowledge chunk based on keyword matching.
 * First pass: exact word match.
 * Second pass: fuzzy word match (lower weight).
 */
function scoreChunkByKeywords(chunk: EmbeddedChunk, query: string): number {
  const q = query.toLowerCase();
  const text = chunk.text.toLowerCase();
  let score = 0;

  const words = q.split(/\s+/).filter((w) => w.length > 2);

  // Pass 1: Exact match
  for (const word of words) {
    if (text.includes(word)) {
      score += 1;
    }
  }

  // Pass 2: Fuzzy match (for improved recall on typos)
  // Only if exact match didn't already score
  for (const word of words) {
    if (!text.includes(word)) {
      // Check if this word fuzzy-matches any word in the chunk text
      if (fuzzyWordInText(word, text)) {
        score += 0.7; // Reduce weight for fuzzy matches
      }
    }
  }

  return score;
}

/**
 * Helper: check if a query word fuzzy-matches any word in the chunk text.
 */
function fuzzyWordInText(word: string, text: string): boolean {
  const textWords = text.split(/\s+/);
  return textWords.some((tw) => tw.length > 2 && isFuzzyMatch(word, tw));
}

function retrieveContext(
  query: string,
  topK = 4
): ScoredChunk[] {
  const scored = CHUNKS.map((chunk) => ({
    text: chunk.text,
    category: chunk.category,
    score: scoreChunkByKeywords(chunk, query),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

export type RagResult = {
  prompt: string;
  sourceCategories: string[];
};

export async function getSystemPromptWithContext(
  query: string,
  signal?: AbortSignal,
  vehicles?: Vehicle[]
): Promise<RagResult> {
  const contextChunks = retrieveContext(query, 7);
  const sourceCategories: string[] = [
    ...new Set(contextChunks.map((c) => c.category)),
  ];

  let contextBlock =
    contextChunks.length > 0
      ? contextChunks.map((c, i) => `[${i + 1}] ${c.text}`).join("\n\n")
      : "";

  // Inject vehicle context when relevant
  if (vehicles && vehicles.length > 0 && isVehicleQuery(query)) {
    const filters = extractVehicleFilters(query, vehicles);
    const { results: matched, totalMatched } = matchVehicles(vehicles, filters, query);
    if (matched.length > 0) {
      const vehicleBlock = formatVehiclesBlock(matched, totalMatched, vehicles.length, filters);
      contextBlock = contextBlock
        ? `${contextBlock}\n\n---\n${vehicleBlock}`
        : vehicleBlock;
      sourceCategories.push("vehicles");
    }
  }

  if (!contextBlock) {
    return { prompt: BASE_SYSTEM_PROMPT, sourceCategories: [] };
  }

  return {
    prompt: `${BASE_SYSTEM_PROMPT}\n\n---\nRelevant context:\n${contextBlock}\n---`,
    sourceCategories,
  };
}
