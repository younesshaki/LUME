import { createClient } from "@supabase/supabase-js";

const MAX_MESSAGES = 30;
const MAX_USER_CONTENT_LENGTH = 4_000;
const SUBDOMAIN_RESERVED = new Set(["www", "app", "api", "admin", "static", "cdn"]);
const VEHICLE_INTENT_KEYWORDS = [
  "car",
  "cars",
  "vehicle",
  "vehicles",
  "inventory",
  "stock",
  "price",
  "mileage",
  "ferrari",
  "lamborghini",
  "bmw",
  "mercedes",
  "porsche",
  "audi",
  "tesla",
  "range rover",
  "do you have",
  "available",
  "how many",
  "count",
];
const MAKE_ALIASES: Record<string, string> = {
  benz: "Mercedes-Benz",
  mercedes: "Mercedes-Benz",
  lambo: "Lamborghini",
  lambos: "Lamborghini",
  vw: "Volkswagen",
  chevy: "Chevrolet",
};

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type ChatRequest = {
  messages: ChatMessage[];
  stream?: boolean;
};

type RetrievedChunk = {
  text: string;
  category: string;
  score: number;
};

type Vehicle = {
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  mileage: number | null;
  bodyStyle: string;
  drivetrain: string;
  fuelType: string;
  sellerCity: string;
  sellerState: string;
  stockType: string | null;
};

type VehicleQueryFilters = {
  make?: string;
};

type VercelRequest = {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
  url?: string;
};

type VercelResponse = {
  status: (statusCode: number) => VercelResponse;
  setHeader: (name: string, value: string) => void;
  json: (payload: unknown) => void;
  write: (chunk: Uint8Array | string) => void;
  end: () => void;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    setCorsHeaders(req, res);
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return json(req, res, { error: "Method not allowed" }, 405);
  }

  if (!isAllowedOrigin(req)) {
    return json(req, res, { error: "Forbidden origin" }, 403);
  }

  const body = req.body as ChatRequest | undefined;
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return json(req, res, { error: "messages must be a non-empty array" }, 400);
  }
  if (body.messages.length > MAX_MESSAGES) {
    return json(req, res, { error: `messages must be <= ${MAX_MESSAGES}` }, 400);
  }

  const cleanMessages: ChatMessage[] = body.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role,
      content: String(m.content ?? "").slice(0, MAX_USER_CONTENT_LENGTH),
    }));

  const lastUser = [...cleanMessages].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    return json(req, res, { error: "no user message found" }, 400);
  }
  const recentUserText = cleanMessages
    .filter((m) => m.role === "user")
    .slice(-3)
    .map((m) => m.content)
    .join(" ");

  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return json(req, res, { error: "Supabase server env not configured" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tenant = await getTenantFromRequest(req, supabase);
  if (!tenant) {
    return json(req, res, { error: "Unknown or inactive tenant" }, 404);
  }

  let assembled;
  try {
    const { data: chunkRows, error: chunkErr } = await supabase
      .from("rag_chunks")
      .select("text, category")
      .eq("tenant_id", tenant.tenantId);
    if (chunkErr) throw new Error(`rag_chunks query failed: ${chunkErr.message}`);

    const contextChunks = retrieveByKeywords(chunkRows ?? [], lastUser.content, 7);

    let matchedVehicles;
    let totalMatched: number | undefined;
    let totalInventory: number | undefined;
    let filters: VehicleQueryFilters | undefined;

    const { data: makeRows, error: makeErr } = await supabase
      .from("vehicles")
      .select("make")
      .eq("tenant_id", tenant.tenantId);
    if (makeErr) throw new Error(`vehicle make query failed: ${makeErr.message}`);

    const knownMakes = uniqueStrings((makeRows ?? []).map((row: { make?: string }) => row.make));
    const directFilters = extractVehicleFilters(lastUser.content, knownMakes);
    const contextualFilters = directFilters.make
      ? directFilters
      : extractVehicleFilters(recentUserText, knownMakes);
    const shouldUseVehicleInventory =
      isVehicleQuery(lastUser.content) ||
      isVehicleFollowUp(lastUser.content) ||
      Boolean(contextualFilters.make);

    if (shouldUseVehicleInventory) {
      const { data: vehicleRows, error: vehicleErr } = await supabase
        .from("vehicles")
        .select("*")
        .eq("tenant_id", tenant.tenantId);
      if (vehicleErr) throw new Error(`vehicles query failed: ${vehicleErr.message}`);

      const vehicles = (vehicleRows ?? []).map(rowToVehicle);
      filters = contextualFilters;
      const match = matchVehicles(vehicles, filters, lastUser.content);
      matchedVehicles = match.results;
      totalMatched = match.totalMatched;
      totalInventory = vehicles.length;
    }

    assembled = assembleSystemPrompt({
      contextChunks,
      matchedVehicles,
      totalMatched,
      totalInventory,
      filters,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RAG failure";
    console.error("[/api/chat] RAG error:", message);
    return json(req, res, { error: "Failed to build context" }, 500);
  }

  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (!deepseekKey) {
    return json(req, res, { error: "DEEPSEEK_API_KEY not configured" }, 500);
  }

  const deepseekUrl =
    process.env.DEEPSEEK_API_URL ?? "https://api.deepseek.com/v1/chat/completions";
  const upstream = await fetch(deepseekUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${deepseekKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      stream: body.stream ?? true,
      messages: [{ role: "system", content: assembled.prompt }, ...cleanMessages],
    }),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    return json(req, res, { error: `Deepseek error ${upstream.status}: ${text}` }, upstream.status);
  }

  setCorsHeaders(req, res);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Source-Categories", assembled.sourceCategories.join(","));

  res.write(
    `data: ${JSON.stringify({
      type: "meta",
      sourceCategories: assembled.sourceCategories,
    })}\n\n`
  );

  if (!upstream.body) {
    res.write(`data: ${JSON.stringify({ type: "error", message: "No upstream body" })}\n\n`);
    return res.end();
  }

  const reader = upstream.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } finally {
    reader.releaseLock();
    res.end();
  }
}

function json(req: VercelRequest, res: VercelResponse, payload: unknown, status: number) {
  setCorsHeaders(req, res);
  return res.status(status).json(payload);
}

async function getTenantFromRequest(
  req: VercelRequest,
  supabase: any
): Promise<{ tenantId: string; slug: string } | null> {
  const slug = extractTenantSlugFromRequest(req);
  if (!slug) return null;

  const { data, error } = await supabase.rpc("tenant_by_slug", { p_slug: slug });
  if (error) {
    console.error("[tenant] tenant_by_slug RPC failed:", error.message);
    return null;
  }

  const row = (data as Array<{ id: string; slug: string; status: string }> | null)?.[0];
  if (!row || row.status !== "active") return null;
  return { tenantId: row.id, slug: row.slug };
}

function extractTenantSlugFromRequest(req: VercelRequest): string | null {
  const headerSlug = header(req, "x-lume-tenant")?.trim();
  if (headerSlug) return headerSlug;

  const querySlug = query(req, "tenant")?.trim();
  if (querySlug) return querySlug;

  const host = header(req, "host");
  if (!host) return null;
  const hostname = host.split(":")[0];
  const parts = hostname.split(".");
  if (parts.length < 3) return null;
  const sub = parts[0];
  if (SUBDOMAIN_RESERVED.has(sub)) return null;
  return sub || null;
}

function isAllowedOrigin(req: VercelRequest): boolean {
  const allowed = (process.env.ALLOWED_CHAT_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (allowed.length === 0) return true;

  const origin = header(req, "origin");
  if (!origin) return false;
  return allowed.includes(origin);
}

function setCorsHeaders(req: VercelRequest, res: VercelResponse) {
  const origin = header(req, "origin") ?? "";
  if (!origin || !isAllowedOrigin(req)) return;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Lume-Tenant");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Vary", "Origin");
}

function header(req: VercelRequest, name: string): string | undefined {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function query(req: VercelRequest, name: string): string | undefined {
  const value = req.query[name];
  return Array.isArray(value) ? value[0] : value;
}

function retrieveByKeywords(
  chunks: Array<{ text: string; category: string }>,
  queryText: string,
  topK: number
): RetrievedChunk[] {
  const words = normalizedWords(queryText).filter((word) => word.length > 2);
  if (words.length === 0) return [];

  return chunks
    .map((chunk, index) => {
      const text = chunk.text.toLowerCase();
      const textWords = normalizedWords(text);
      let score = 0;

      for (const word of words) {
        if (text.includes(word)) score += 1;
        else if (textWords.some((candidate) => levenshteinDistance(word, candidate) <= 1)) score += 0.5;
      }

      return { ...chunk, score, index };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, topK)
    .map(({ text, category, score }) => ({ text, category, score }));
}

function isVehicleQuery(queryText: string): boolean {
  const query = queryText.toLowerCase();
  return VEHICLE_INTENT_KEYWORDS.some((keyword) => query.includes(keyword));
}

function isVehicleFollowUp(queryText: string): boolean {
  return /\b(how many|count|they|those|them|ones|what about)\b/i.test(queryText);
}

function extractVehicleFilters(queryText: string, makes: string[]): VehicleQueryFilters {
  const queryWords = normalizedWords(queryText).flatMap((word) => [
    word,
    singularize(word),
  ]);
  const queryWordSet = new Set(queryWords);

  for (const word of queryWords) {
    const alias = MAKE_ALIASES[word];
    if (alias && makes.includes(alias)) return { make: alias };
  }

  const make = makes
    .slice()
    .sort((a, b) => b.length - a.length)
    .find((candidate) => matchesMake(queryWordSet, candidate));

  return make ? { make } : {};
}

function matchVehicles(vehicles: Vehicle[], filters: VehicleQueryFilters, queryText: string) {
  let results = vehicles;

  if (filters.make) {
    results = results.filter(
      (vehicle) => vehicle.make.toLowerCase() === filters.make!.toLowerCase()
    );
  }

  const totalMatched = results.length;
  const query = queryText.toLowerCase();
  if (/most expensive|highest price|priciest/.test(query)) {
    results = [...results].sort((a, b) => b.price - a.price);
  } else if (/cheapest|lowest price|least expensive|affordable/.test(query)) {
    results = [...results].sort((a, b) => a.price - b.price);
  }

  return { results: results.slice(0, 30), totalMatched };
}

function assembleSystemPrompt({
  contextChunks,
  matchedVehicles,
  totalMatched,
  totalInventory,
  filters,
}: {
  contextChunks: RetrievedChunk[];
  matchedVehicles?: Vehicle[];
  totalMatched?: number;
  totalInventory?: number;
  filters?: { make?: string };
}) {
  const sourceCategories = [...new Set(contextChunks.map((chunk) => chunk.category))];
  const contextBlock = contextChunks.map((chunk, index) => `[${index + 1}] ${chunk.text}`).join("\n\n");
  const vehicleBlock =
    matchedVehicles && matchedVehicles.length > 0
      ? formatVehiclesBlock(
          matchedVehicles,
          totalMatched ?? matchedVehicles.length,
          totalInventory ?? matchedVehicles.length,
          filters ?? {}
        )
      : "";

  if (vehicleBlock) sourceCategories.push("vehicles");

  const prompt = [
    "You are the LUME assistant. Answer only using the supplied context and inventory. Be concise, useful, and specific.",
    "If the user asks about available vehicles, use the VEHICLE INVENTORY section and mention real matching vehicles.",
    "For count questions, answer with the exact TOTAL MATCHING value from VEHICLE INVENTORY. Do not count only the shown sample rows.",
    "If the answer is not in the supplied context, say that you do not have that information.",
    contextBlock ? `Relevant context:\n${contextBlock}` : "",
    vehicleBlock,
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  return { prompt, sourceCategories };
}

function formatVehiclesBlock(
  vehicles: Vehicle[],
  totalMatched: number,
  totalInventory: number,
  filters: { make?: string }
) {
  const filterSummary = filters.make ? ` matching make=${filters.make}` : "";
  const showingNote =
    vehicles.length < totalMatched
      ? `Showing first ${vehicles.length} of ${totalMatched}.`
      : `All ${totalMatched} shown below.`;

  const lines = vehicles.map((vehicle, index) => {
    const parts = [
      `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      vehicle.trim || null,
      vehicle.stockType,
      `Est. $${vehicle.price.toLocaleString()}`,
      vehicle.mileage !== null ? `${vehicle.mileage.toLocaleString()} mi` : null,
      vehicle.bodyStyle || null,
      vehicle.drivetrain || null,
      vehicle.fuelType || null,
      vehicle.sellerCity ? `${vehicle.sellerCity}, ${vehicle.sellerState}` : null,
    ].filter(Boolean);
    return `[${index + 1}] ${parts.join(" | ")}`;
  });

  return [
    "=== VEHICLE INVENTORY ===",
    `Total vehicles in full inventory: ${totalInventory}`,
    `TOTAL MATCHING${filterSummary}: ${totalMatched}`,
    showingNote,
    ...lines,
    "=========================",
  ].join("\n");
}

function rowToVehicle(row: any): Vehicle {
  return {
    year: row.year,
    make: row.make,
    model: row.model,
    trim: row.trim ?? "",
    price: row.price ?? 0,
    mileage: row.mileage,
    bodyStyle: row.body_style ?? "",
    drivetrain: row.drivetrain ?? "",
    fuelType: row.fuel_type ?? "",
    sellerCity: row.seller_city ?? "",
    sellerState: row.seller_state ?? "",
    stockType: row.stock_type,
  };
}

function normalizedWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function singularize(word: string): string {
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("s") && word.length > 3) return word.slice(0, -1);
  return word;
}

function matchesMake(queryWordSet: Set<string>, make: string): boolean {
  const makeWords = normalizedWords(make).flatMap((word) => [word, singularize(word)]);
  const compactMake = makeWords.join("");

  if (queryWordSet.has(compactMake) || queryWordSet.has(singularize(compactMake))) {
    return true;
  }

  return makeWords.some((makeWord) => {
    if (queryWordSet.has(makeWord)) return true;
    return [...queryWordSet].some((queryWord) => {
      if (queryWord.length < 4 || makeWord.length < 4) return false;
      return levenshteinDistance(queryWord, makeWord) <= 1;
    });
  });
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 2;

  const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}
