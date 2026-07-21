/**
 * System prompt assembly. Tenant-aware — each tenant supplies its own base
 * persona; this module injects retrieved context and vehicle inventory.
 *
 * IMPORTANT: This runs server-side only. The assembled prompt MUST NOT be
 * returned to the client — only the model's streamed output and the list of
 * source categories should ever leave the server.
 */
import type { RetrievedChunk, Vehicle } from "@lume/types";
import type { VehicleQueryFilters } from "./vehicleFilters";

const DEFAULT_BASE_PROMPT = `You are an AI assistant. Answer ONLY using the context provided below. If the answer is not in the context, say: "I don't have that information."`;

export type SystemPromptOptions = {
  /** Tenant-specific persona / brand voice. Falls back to a neutral default. */
  basePrompt?: string;
  /** Top-k chunks retrieved by similarity search. */
  contextChunks: RetrievedChunk[];
  /** Vehicles matching the query, ranked. Pass [] when the query isn't vehicle-related. */
  matchedVehicles?: Vehicle[];
  /** Total count of vehicles matching filters BEFORE truncation — used for "how many" answers. */
  totalMatched?: number;
  /** Total inventory size for context. */
  totalInventory?: number;
  /** Filters that were applied, for transparency in the prompt. */
  filters?: VehicleQueryFilters;
};

export type AssembledPrompt = {
  prompt: string;
  sourceCategories: string[];
};

function formatVehiclePrice(price: number): string {
  return `Est. $${price.toLocaleString()}`;
}

function formatVehiclesBlock(
  matched: Vehicle[],
  totalMatched: number,
  totalInventory: number | undefined,
  filters: VehicleQueryFilters
): string {
  const isFiltered = Object.keys(filters).length > 0;
  const filterSummary = isFiltered
    ? ` (${Object.entries(filters).map(([k, v]) => `${k}=${v}`).join(", ")})`
    : "";
  const showingNote =
    matched.length < totalMatched
      ? `Showing first ${matched.length} of ${totalMatched} — use the TOTAL MATCHING count when answering "how many".`
      : `All ${totalMatched} shown below.`;

  const header =
    `=== VEHICLE INVENTORY ===\n` +
    (totalInventory === undefined
      ? ""
      : `Total vehicles in full inventory: ${totalInventory}\n`) +
    `TOTAL MATCHING${filterSummary}: ${totalMatched}\n` +
    `${showingNote}\n` +
    `AVAILABILITY TRUTH RULE: TOTAL MATCHING is authoritative. When it is greater than 0, ` +
    `you MUST say matching inventory is available and MUST NOT say it is unavailable, absent, ` +
    `or that the listed matching vehicles are another make/model. When it is 0, say none match.\n` +
    `INVENTORY PRECEDENCE RULE: This live matching block overrides every other context block, ` +
    `including retrieved knowledge text and earlier conversation prose, for vehicle availability, ` +
    `counts, prices, mileage, and vehicle identity.\n` +
    `FACTUAL BOUNDARY RULE: Do not invent or infer market comparisons, percentages, discounts, ` +
    `price history, deal quality, reliability, condition, accident history, options, or specifications. ` +
    `State those only when an explicit value is present in the provided context; otherwise say it is not listed.\n` +
    `GROUNDING RULE: For this visitor request, mention, recommend, count, or ` +
    `navigate only the vehicles in this matching block. Do not substitute or ` +
    `describe vehicles outside these filters. If no vehicles match, say so ` +
    `plainly and offer to broaden the search only if the visitor asks.\n`;

  const lines = matched.map((v, i) => {
    const parts = [
      `${v.year} ${v.make} ${v.model}`,
      v.trim || null,
      v.stockType,
      formatVehiclePrice(v.price),
      v.mileage !== null
        ? v.mileage === 0 ? "0 mi (new)" : `${v.mileage.toLocaleString()} mi`
        : null,
      v.bodyStyle || null,
      v.drivetrain || null,
      v.fuelType || null,
      v.sellerCity ? `${v.sellerCity}, ${v.sellerState}` : null,
    ].filter(Boolean);
    return `[${i + 1}] ${parts.join(" | ")}`;
  });

  return `${header}\n${lines.length > 0 ? lines.join("\n") : "No matching live vehicles."}\n==============================`;
}

export function assembleSystemPrompt(opts: SystemPromptOptions): AssembledPrompt {
  const base = opts.basePrompt?.trim() || DEFAULT_BASE_PROMPT;
  const sourceCategories: string[] = [
    ...new Set(opts.contextChunks.map((c) => c.category)),
  ];

  let contextBlock =
    opts.contextChunks.length > 0
      ? opts.contextChunks.map((c, i) => `[${i + 1}] ${c.text}`).join("\n\n")
      : "";

  if (opts.matchedVehicles !== undefined) {
    const vehicleBlock = formatVehiclesBlock(
      opts.matchedVehicles,
      opts.totalMatched ?? opts.matchedVehicles.length,
      opts.totalInventory,
      opts.filters ?? {}
    );
    contextBlock = contextBlock ? `${contextBlock}\n\n---\n${vehicleBlock}` : vehicleBlock;
    sourceCategories.push("vehicles");
  }

  if (!contextBlock) {
    return { prompt: base, sourceCategories: [] };
  }

  return {
    prompt: `${base}\n\n---\nRelevant context:\n${contextBlock}\n---`,
    sourceCategories,
  };
}
