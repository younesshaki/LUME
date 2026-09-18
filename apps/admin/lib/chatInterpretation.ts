import type { VehicleQueryFilters } from "@lume/rag";

/**
 * Phase 3: a closed, versioned schema for what a visitor's sentence MEANS.
 *
 * The deterministic layer recognises shapes of sentences it was taught. That
 * is why "open the 3rd one" and "back to the whole inventory" each shipped as
 * bugs: a fixed phrase list is always a step behind how people actually talk.
 * A model is genuinely better at that one job — deciding which of a small set
 * of known intents a sentence expresses.
 *
 * What it is emphatically NOT allowed to do is act. Everything here is a
 * *description* of intent: no vehicle ids, no URLs, no SQL, no UI actions, no
 * capability names. An accepted interpretation is fed back through the same
 * deterministic transition, query and grounding layers that already guard the
 * pattern-matched path, so the model can change what LUME *understands* and
 * never what LUME *does*.
 *
 * Bump the version when a change would make an older build misread a stored
 * or logged plan.
 */
export const CHAT_INTERPRETATION_SCHEMA_VERSION = 1;

/** Filter fields a visitor can state. Mirrors the deterministic extractor. */
export const INTERPRETABLE_FILTER_KEYS = [
  "make",
  "model",
  "bodyStyle",
  "stockType",
  "fuelType",
  "drivetrain",
  "sellerState",
  "sellerCity",
  "year",
  "yearMin",
  "yearMax",
  "mileageMax",
  "priceMin",
  "priceMax",
] as const satisfies readonly (keyof VehicleQueryFilters)[];

export type InterpretableFilterKey = (typeof INTERPRETABLE_FILTER_KEYS)[number];

/** Why the concierge would need to ask. Closed set; the server writes words. */
export const INTERPRETATION_CLARIFY_REASONS = [
  "ambiguous_affirmation",
  "ambiguous_make",
  "ambiguous_reference",
  "conflicting_constraints",
  "unsupported_request",
] as const;

export type InterpretationClarifyReason =
  (typeof INTERPRETATION_CLARIFY_REASONS)[number];

export type InterpretationReference =
  | { kind: "ordinal"; position: number }
  | { kind: "last" }
  | { kind: "selected" }
  | { kind: "compare"; positions: number[] };

export type ChatInterpretationKind =
  | "search"
  | "refine"
  | "reset"
  | "present"
  | "reference"
  | "selected_followup"
  | "lead_form"
  | "clarify"
  | "unsupported";

export type ChatInterpretation = {
  version: number;
  kind: ChatInterpretationKind;
  /** Filters the visitor stated in THIS message. Never inferred history. */
  setFilters: Partial<Record<InterpretableFilterKey, string | number>>;
  /** Filters the visitor explicitly dropped ("not Toyota", "any year"). */
  clearFilters: InterpretableFilterKey[];
  reference: InterpretationReference | null;
  clarifyReason: InterpretationClarifyReason | null;
  /**
   * Parts of the message this schema cannot express. Recorded rather than
   * dropped: silently discarding half a request is how "BMWs under 40k with a
   * trade-in" becomes a plain BMW search and nobody notices.
   */
  unsupportedClauses: string[];
};

const MAX_UNSUPPORTED_CLAUSES = 4;
const MAX_CLAUSE_LENGTH = 120;
const MAX_ORDINAL_POSITION = 20;
const MAX_COMPARE_POSITIONS = 4;
const MAX_FILTER_TEXT_LENGTH = 60;

const KINDS: readonly ChatInterpretationKind[] = [
  "search",
  "refine",
  "reset",
  "present",
  "reference",
  "selected_followup",
  "lead_form",
  "clarify",
  "unsupported",
];

const NUMERIC_KEYS: readonly InterpretableFilterKey[] = [
  "year",
  "yearMin",
  "yearMax",
  "mileageMax",
  "priceMin",
  "priceMax",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFilterKey(value: unknown): value is InterpretableFilterKey {
  return (
    typeof value === "string" &&
    (INTERPRETABLE_FILTER_KEYS as readonly string[]).includes(value)
  );
}

function boundedPosition(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_ORDINAL_POSITION
    ? value
    : null;
}

function parseReference(value: unknown): InterpretationReference | null {
  if (!isRecord(value)) return null;
  switch (value.kind) {
    case "ordinal": {
      const position = boundedPosition(value.position);
      return position === null ? null : { kind: "ordinal", position };
    }
    case "last":
      return { kind: "last" };
    case "selected":
      return { kind: "selected" };
    case "compare": {
      if (!Array.isArray(value.positions)) return null;
      const positions = value.positions
        .map(boundedPosition)
        .filter((entry): entry is number => entry !== null);
      // A comparison of one thing is not a comparison; treat it as malformed
      // rather than quietly turning it into a reference.
      return positions.length >= 2 && positions.length <= MAX_COMPARE_POSITIONS
        ? { kind: "compare", positions: positions.slice(0, MAX_COMPARE_POSITIONS) }
        : null;
    }
    default:
      return null;
  }
}

function parseSetFilters(
  value: unknown,
): ChatInterpretation["setFilters"] | null {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) return null;
  const out: ChatInterpretation["setFilters"] = {};
  for (const [key, raw] of Object.entries(value)) {
    // An unknown key is not something to skip past: it means the model is
    // working from a schema this build does not implement.
    if (!isFilterKey(key)) return null;
    if (NUMERIC_KEYS.includes(key)) {
      if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return null;
      out[key] = raw;
      continue;
    }
    if (typeof raw !== "string") return null;
    const text = raw.trim().slice(0, MAX_FILTER_TEXT_LENGTH);
    if (!text) return null;
    out[key] = text;
  }
  return out;
}

/**
 * Parse a model's reply into an interpretation, or reject it.
 *
 * Deliberately total and strict: anything unexpected returns null rather than
 * a partially-understood plan. A plan we half-understand is worse than none,
 * because the half we kept looks confident.
 */
export function parseChatInterpretation(content: string): ChatInterpretation | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(content));
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (parsed.version !== CHAT_INTERPRETATION_SCHEMA_VERSION) return null;
  if (!KINDS.includes(parsed.kind as ChatInterpretationKind)) return null;
  const kind = parsed.kind as ChatInterpretationKind;

  const setFilters = parseSetFilters(parsed.setFilters);
  if (setFilters === null) return null;

  if (parsed.clearFilters !== undefined && !Array.isArray(parsed.clearFilters)) {
    return null;
  }
  const clearFilters = (parsed.clearFilters ?? []) as unknown[];
  if (!clearFilters.every(isFilterKey)) return null;

  const reference =
    parsed.reference === undefined || parsed.reference === null
      ? null
      : parseReference(parsed.reference);
  if (parsed.reference && reference === null) return null;
  // A reference kind with no reference is a contradiction, not a default.
  if (kind === "reference" && reference === null) return null;

  const clarifyReason =
    parsed.clarifyReason === undefined || parsed.clarifyReason === null
      ? null
      : typeof parsed.clarifyReason === "string" &&
          (INTERPRETATION_CLARIFY_REASONS as readonly string[]).includes(
            parsed.clarifyReason,
          )
        ? (parsed.clarifyReason as InterpretationClarifyReason)
        : null;
  if (parsed.clarifyReason && clarifyReason === null) return null;
  if (kind === "clarify" && clarifyReason === null) return null;

  if (
    parsed.unsupportedClauses !== undefined &&
    !Array.isArray(parsed.unsupportedClauses)
  ) {
    return null;
  }
  const unsupportedClauses = ((parsed.unsupportedClauses ?? []) as unknown[])
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().slice(0, MAX_CLAUSE_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_UNSUPPORTED_CLAUSES);

  return {
    version: CHAT_INTERPRETATION_SCHEMA_VERSION,
    kind,
    setFilters,
    clearFilters: [...new Set(clearFilters as InterpretableFilterKey[])],
    reference,
    clarifyReason,
    unsupportedClauses,
  };
}

function stripCodeFence(content: string): string {
  const trimmed = content.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
}

/** The schema, described for the model. No tenant data appears here. */
export function buildInterpretationSchemaPrompt(): string {
  return [
    "You classify one visitor message for a car-dealership concierge. You do not answer it.",
    "You have no access to inventory, customer records, or the site. You cannot navigate, filter, open a page, or take any action.",
    `Return ONLY JSON: {"version":${CHAT_INTERPRETATION_SCHEMA_VERSION},"kind":...,"setFilters":{...},"clearFilters":[...],"reference":...,"clarifyReason":...,"unsupportedClauses":[...]}`,
    `kind is one of: ${KINDS.join(" | ")}`,
    `setFilters keys: ${INTERPRETABLE_FILTER_KEYS.join(", ")}. Numbers for year, yearMin, yearMax, mileageMax, priceMin, priceMax; strings otherwise. Include ONLY what this message states.`,
    "clearFilters lists fields the visitor explicitly dropped, e.g. 'any year', 'not Toyota'.",
    'reference is {"kind":"ordinal","position":N} | {"kind":"last"} | {"kind":"selected"} | {"kind":"compare","positions":[N,M]} | null.',
    `clarifyReason is one of ${INTERPRETATION_CLARIFY_REASONS.join(" | ")} when kind is clarify, otherwise null.`,
    "unsupportedClauses holds any part of the request this schema cannot express. Never drop a clause silently.",
    "Never invent a make, model, price or vehicle the visitor did not mention.",
  ].join("\n");
}
