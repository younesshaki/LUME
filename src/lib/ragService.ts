import embeddedChunks from "./knowledge/embeddings.json";
import type { Vehicle } from "../experience/vehicles/catalog";

type EmbeddedChunk = {
  id: string;
  text: string;
  category: string;
  embedding: number[];
};

const CHUNKS = embeddedChunks as EmbeddedChunk[];

const OLLAMA_EMBED_URL =
  (import.meta.env.VITE_OLLAMA_CHAT_URL as string | undefined)?.replace(
    "/api/chat",
    "/api/embeddings"
  ) ?? "/ollama/api/embeddings";

const EMBED_MODEL =
  (import.meta.env.VITE_OLLAMA_EMBED_MODEL as string | undefined) ?? "nomic-embed-text";

const BASE_SYSTEM_PROMPT = `You are the LUME assistant. LUME is an invitation-only secret luxury hotel in Monaco with approximately 70 rooms. Access is granted based on positive societal impact, not wealth — one stay per year per invited guest.

CRITICAL RULES — follow these without exception:
1. LUME is a luxury hotel in Monaco. It is NOT a personal care brand, NOT a deodorant brand, NOT a consumer goods company. Do not confuse it with any other brand named Lume or similar.
2. Answer ONLY using the context provided below. Do not use any prior training knowledge about LUME or any other brand.
3. If the answer is not found in the provided context, say: "I don't have that information — please visit lume.com or contact us directly."
4. Never invent, guess, or extrapolate products, facts, or details that are not explicitly stated in the context.

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
  year?: number;
};

// ─── Extract structured filters from a natural-language query ────────────────
function extractVehicleFilters(query: string): VehicleQueryFilters {
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

  return filters;
}

// ─── Filter vehicles and return the most relevant matches ─────────────────────
function matchVehicles(vehicles: Vehicle[], filters: VehicleQueryFilters): Vehicle[] {
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
  if (filters.year) {
    results = results.filter((v) => v.year === filters.year);
  }

  // Cap results — more context when filtered, summary when broad
  const cap = Object.keys(filters).length > 0 ? 30 : 15;
  return results.slice(0, cap);
}

// ─── Format vehicle list for injection into the system prompt ─────────────────
function formatVehiclesBlock(matched: Vehicle[], total: number, filters: VehicleQueryFilters): string {
  const isFiltered = Object.keys(filters).length > 0;
  const header = isFiltered
    ? `Matching vehicles (${matched.length} of ${total} total):`
    : `Vehicle inventory sample (${matched.length} of ${total} total vehicles available):`;

  const lines = matched.map((v, i) => {
    const parts = [
      `${v.year} ${v.make} ${v.model}`,
      v.trim ? v.trim : null,
      v.stockType,
      v.mileage !== null ? (v.mileage === 0 ? "New / 0 mi" : `${v.mileage.toLocaleString()} mi`) : null,
      v.bodyStyle || null,
      v.drivetrain || null,
      v.fuelType || null,
      v.sellerCity ? `${v.sellerCity}, ${v.sellerState}` : null,
    ].filter(Boolean);
    return `[${i + 1}] ${parts.join(" | ")}`;
  });

  return `${header}\n${lines.join("\n")}`;
}

// ─── Cosine similarity ────────────────────────────────────────────────────────
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function embedQuery(query: string, signal?: AbortSignal): Promise<number[]> {
  const response = await fetch(OLLAMA_EMBED_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: query }),
    signal,
  });
  if (!response.ok) {
    throw new Error(`Embedding failed: ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as { embedding: number[] };
  return data.embedding;
}

type ScoredChunk = {
  text: string;
  category: string;
  score: number;
};

async function retrieveContext(
  query: string,
  topK = 4,
  signal?: AbortSignal
): Promise<ScoredChunk[]> {
  const queryEmbedding = await embedQuery(query, signal);
  const scored = CHUNKS.map((chunk) => ({
    text: chunk.text,
    category: chunk.category,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
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
  const contextChunks = await retrieveContext(query, 7, signal);
  const sourceCategories: string[] = [
    ...new Set(contextChunks.map((c) => c.category)),
  ];

  let contextBlock =
    contextChunks.length > 0
      ? contextChunks.map((c, i) => `[${i + 1}] ${c.text}`).join("\n\n")
      : "";

  // Inject vehicle context when relevant
  if (vehicles && vehicles.length > 0 && isVehicleQuery(query)) {
    const filters = extractVehicleFilters(query);
    const matched = matchVehicles(vehicles, filters);
    if (matched.length > 0) {
      const vehicleBlock = formatVehiclesBlock(matched, vehicles.length, filters);
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
