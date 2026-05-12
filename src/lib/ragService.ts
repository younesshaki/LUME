import embeddedChunks from "./knowledge/embeddings.json";
import { formatVehiclePrice, type Vehicle } from "../experience/vehicles/catalog";

type EmbeddedChunk = {
  id: string;
  text: string;
  category: string;
  embedding: number[];
};

const CHUNKS = embeddedChunks as EmbeddedChunk[];


const BASE_SYSTEM_PROMPT = `You are the LUME assistant. LUME is an invitation-only secret luxury hotel in Monaco with approximately 70 rooms. Access is granted based on positive societal impact, not wealth — one stay per year per invited guest. LUME also includes a concept/demo vehicle marketplace for browsing new and used vehicles.

CRITICAL RULES — follow these without exception:
1. LUME is a luxury hotel in Monaco. It is NOT a personal care brand, NOT a deodorant brand, NOT a consumer goods company. Do not confuse it with any other brand named Lume or similar.
2. Answer ONLY using the context provided below. Do not use any prior training knowledge about LUME or any other brand.
3. If the answer is not found in the provided context, say: "I don't have that information — please visit lume.com or contact us directly."
4. Never invent, guess, or extrapolate products, facts, or details that are not explicitly stated in the context.
5. FOR VEHICLE QUESTIONS: When the context includes a LUME VEHICLE INVENTORY section, use ONLY the vehicles listed there. Do not invent, hallucinate, or imagine vehicles. If a vehicle is not in the list, it does not exist in inventory. Always count only the vehicles provided in the inventory section.

Tone: concise, restrained, and confident — matching LUME's premium brand voice.`;

// ─── Make alias map for normalisation ────────────────────────────────────────
const MAKE_ALIASES: Record<string, string> = {
  "mercedes": "Mercedes-Benz",
  "mercedes benz": "Mercedes-Benz",
  "vw": "Volkswagen",
  "rolls royce": "Rolls-Royce",
  "landrover": "Land Rover",
  "chevy": "Chevrolet",
  "infiniti": "INFINITI",
  "lambo": "Lamborghini",
  "lamborghini": "Lamborghini",
};

const ALL_MAKES = [
  "acura","audi","bmw","buick","cadillac","chevrolet","chevy","chrysler","dodge",
  "ferrari","ford","gmc","genesis","honda","hummer","hyundai","infiniti","jaguar",
  "jeep","kia","lamborghini","land rover","landrover","lexus","lincoln","mini",
  "maserati","mazda","mercedes-benz","mercedes benz","mercedes","mitsubishi",
  "nissan","polestar","porsche","ram","rolls-royce","rolls royce","subaru",
  "tesla","toyota","volkswagen","vw","volvo",
];

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
function extractVehicleFilters(query: string, vehicles: Vehicle[] = []): VehicleQueryFilters {
  const q = query.toLowerCase();
  const filters: VehicleQueryFilters = {};

  // Make
  for (const alias of ALL_MAKES) {
    if (q.includes(alias)) {
      const canonical =
        MAKE_ALIASES[alias] ??
        alias.replace(/(^|\s)\w/g, (c) => c.toUpperCase());
      filters.make = canonical;
      break;
    }
  }

  // Body style
  if (/\bsuv\b/.test(q)) filters.bodyStyle = "SUV";
  else if (/\bsedan\b/.test(q)) filters.bodyStyle = "Sedan";
  else if (/\bcoupe\b/.test(q)) filters.bodyStyle = "Coupe";
  else if (/\btruck\b/.test(q)) filters.bodyStyle = "Truck";
  else if (/\bconvertible\b/.test(q)) filters.bodyStyle = "Convertible";
  else if (/\bhatchback\b/.test(q)) filters.bodyStyle = "Hatchback";
  else if (/\bwagon\b/.test(q)) filters.bodyStyle = "Wagon";
  else if (/\bminivan\b|\bvan\b/.test(q)) filters.bodyStyle = "Minivan";

  // Stock type
  if (/\bnew\b/.test(q)) filters.stockType = "New";
  else if (/\bused\b|\bpre-?owned\b/.test(q)) filters.stockType = "Used";

  // Fuel type
  if (/\belectric\b|\b\bev\b/.test(q)) filters.fuelType = "Electric";
  else if (/\bplug.?in\b/.test(q)) filters.fuelType = "Plug-In Hybrid";
  else if (/\bhybrid\b/.test(q)) filters.fuelType = "Hybrid";
  else if (/\bdiesel\b/.test(q)) filters.fuelType = "Diesel";

  // Drivetrain
  if (/\bawd\b|\ball.?wheel\b/.test(q)) filters.drivetrain = "AWD";
  else if (/\b4wd\b|\bfour.?wheel\b/.test(q)) filters.drivetrain = "4WD";
  else if (/\bfwd\b|\bfront.?wheel\b/.test(q)) filters.drivetrain = "FWD";
  else if (/\brwd\b|\brear.?wheel\b/.test(q)) filters.drivetrain = "RWD";

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

function scoreChunkByKeywords(chunk: EmbeddedChunk, query: string): number {
  const q = query.toLowerCase();
  const text = chunk.text.toLowerCase();
  let score = 0;

  const words = q.split(/\s+/).filter((w) => w.length > 2);
  for (const word of words) {
    if (text.includes(word)) score += 1;
  }

  return score;
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
