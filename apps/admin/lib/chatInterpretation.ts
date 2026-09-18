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
  "relative_constraint",
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
const MIN_VEHICLE_YEAR = 1886;
const MAX_VEHICLE_YEAR = 2100;
const MAX_PRICE = 100_000_000;
const MAX_MILEAGE = 10_000_000;

const TOP_LEVEL_KEYS = new Set([
  "version",
  "kind",
  "setFilters",
  "clearFilters",
  "reference",
  "clarifyReason",
  "unsupportedClauses",
]);

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
      if (!hasExactKeys(value, ["kind", "position"])) return null;
      const position = boundedPosition(value.position);
      return position === null ? null : { kind: "ordinal", position };
    }
    case "last":
      if (!hasExactKeys(value, ["kind"])) return null;
      return { kind: "last" };
    case "selected":
      if (!hasExactKeys(value, ["kind"])) return null;
      return { kind: "selected" };
    case "compare": {
      if (!hasExactKeys(value, ["kind", "positions"])) return null;
      if (!Array.isArray(value.positions)) return null;
      const parsedPositions = value.positions.map(boundedPosition);
      // Reject the whole reference when even one position is invalid. Keeping
      // the valid subset would silently change "compare 1, 999 and 2" into a
      // request the visitor did not make.
      if (parsedPositions.some((position) => position === null)) return null;
      const positions = parsedPositions as number[];
      // A comparison of one thing is not a comparison; treat it as malformed
      // rather than quietly turning it into a reference.
      return positions.length >= 2 && positions.length <= MAX_COMPARE_POSITIONS
        ? {
            kind: "compare",
            positions: positions.slice(0, MAX_COMPARE_POSITIONS),
          }
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
      if (!validNumericFilter(key, raw)) return null;
      out[key] = raw;
      continue;
    }
    if (typeof raw !== "string") return null;
    const text = raw.trim();
    if (text.length > MAX_FILTER_TEXT_LENGTH) return null;
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
export function parseChatInterpretation(
  content: string,
): ChatInterpretation | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(content));
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  // A model working from a newer/different schema must be rejected wholesale.
  // Silently dropping an `action`, URL, id, or future field would turn a
  // partially-understood plan into an apparently valid one.
  if (Object.keys(parsed).some((key) => !TOP_LEVEL_KEYS.has(key))) return null;
  if (parsed.version !== CHAT_INTERPRETATION_SCHEMA_VERSION) return null;
  if (!KINDS.includes(parsed.kind as ChatInterpretationKind)) return null;
  const kind = parsed.kind as ChatInterpretationKind;

  const setFilters = parseSetFilters(parsed.setFilters);
  if (setFilters === null) return null;

  if (
    parsed.clearFilters !== undefined &&
    !Array.isArray(parsed.clearFilters)
  ) {
    return null;
  }
  const clearFilters = (parsed.clearFilters ?? []) as unknown[];
  if (!clearFilters.every(isFilterKey)) return null;
  if (clearFilters.some((key) => setFilters[key] !== undefined)) return null;

  const hasRawReference =
    parsed.reference !== undefined && parsed.reference !== null;
  const reference = hasRawReference ? parseReference(parsed.reference) : null;
  if (hasRawReference && reference === null) return null;
  // A reference kind with no reference is a contradiction, not a default.
  if (kind === "reference" && reference === null) return null;

  const hasRawClarifyReason =
    parsed.clarifyReason !== undefined && parsed.clarifyReason !== null;
  const clarifyReason = !hasRawClarifyReason
    ? null
    : typeof parsed.clarifyReason === "string" &&
        (INTERPRETATION_CLARIFY_REASONS as readonly string[]).includes(
          parsed.clarifyReason,
        )
      ? (parsed.clarifyReason as InterpretationClarifyReason)
      : null;
  if (hasRawClarifyReason && clarifyReason === null) return null;
  if (kind === "clarify" && clarifyReason === null) return null;

  if (
    parsed.unsupportedClauses !== undefined &&
    !Array.isArray(parsed.unsupportedClauses)
  ) {
    return null;
  }
  const rawUnsupportedClauses = (parsed.unsupportedClauses ?? []) as unknown[];
  if (rawUnsupportedClauses.length > MAX_UNSUPPORTED_CLAUSES) return null;
  if (!rawUnsupportedClauses.every((entry) => typeof entry === "string")) {
    return null;
  }
  if (
    rawUnsupportedClauses.some(
      (entry) => (entry as string).trim().length > MAX_CLAUSE_LENGTH,
    )
  ) {
    return null;
  }
  const unsupportedClauses = rawUnsupportedClauses
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const interpretation: ChatInterpretation = {
    version: CHAT_INTERPRETATION_SCHEMA_VERSION,
    kind,
    setFilters,
    clearFilters: [...new Set(clearFilters as InterpretableFilterKey[])],
    reference,
    clarifyReason,
    unsupportedClauses,
  };
  return interpretationIsConsistent(interpretation) ? interpretation : null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  const expected = new Set(allowed);
  return (
    Object.keys(value).every((key) => expected.has(key)) &&
    allowed.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function validNumericFilter(
  key: InterpretableFilterKey,
  value: unknown,
): value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return false;
  }
  if (key === "year" || key === "yearMin" || key === "yearMax") {
    return (
      Number.isInteger(value) &&
      value >= MIN_VEHICLE_YEAR &&
      value <= MAX_VEHICLE_YEAR
    );
  }
  if (key === "mileageMax") return value <= MAX_MILEAGE;
  if (key === "priceMin" || key === "priceMax") return value <= MAX_PRICE;
  return true;
}

function interpretationIsConsistent(value: ChatInterpretation): boolean {
  const setCount = Object.keys(value.setFilters).length;
  const clearCount = value.clearFilters.length;
  const hasFilterChanges = setCount > 0 || clearCount > 0;
  const hasReference = value.reference !== null;
  const hasClarifier = value.clarifyReason !== null;
  const priceMin = value.setFilters.priceMin;
  const priceMax = value.setFilters.priceMax;
  const yearMin = value.setFilters.yearMin;
  const yearMax = value.setFilters.yearMax;

  if (
    typeof priceMin === "number" &&
    typeof priceMax === "number" &&
    priceMin > priceMax
  ) {
    return false;
  }
  if (
    typeof yearMin === "number" &&
    typeof yearMax === "number" &&
    yearMin > yearMax
  ) {
    return false;
  }
  const year = value.setFilters.year;
  if (
    typeof year === "number" &&
    ((typeof yearMin === "number" && year < yearMin) ||
      (typeof yearMax === "number" && year > yearMax))
  ) {
    return false;
  }

  switch (value.kind) {
    case "reference":
      return hasReference && !hasFilterChanges && !hasClarifier;
    case "clarify":
      return hasClarifier && !hasReference && !hasFilterChanges;
    case "present":
      return !hasReference && !hasClarifier && !hasFilterChanges;
    case "selected_followup":
    case "lead_form":
      return (
        (!hasReference || value.reference?.kind === "selected") &&
        !hasClarifier &&
        !hasFilterChanges
      );
    case "search":
      return setCount > 0 && !hasReference && !hasClarifier;
    case "refine":
      // Relative refinements such as "anything cheaper?" cannot be reduced to
      // a trusted numeric filter. They must retain that clause for a later
      // clarification rather than becoming an empty executable refinement.
      return hasFilterChanges && !hasReference && !hasClarifier;
    case "reset":
      return setCount === 0 && !hasReference && !hasClarifier;
    case "unsupported":
      return (
        value.unsupportedClauses.length > 0 &&
        !hasReference &&
        !hasClarifier &&
        !hasFilterChanges
      );
  }
}

function stripCodeFence(content: string): string {
  const trimmed = content.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "")
    .trim();
}

/** The schema, described for the model. No tenant data appears here. */
export function buildInterpretationSchemaPrompt(): string {
  return [
    "You classify one visitor message for a car-dealership concierge. You do not answer it.",
    "You have no access to inventory, customer records, or the site. You cannot navigate, filter, open a page, or take any action.",
    `Return ONLY JSON: {"version":${CHAT_INTERPRETATION_SCHEMA_VERSION},"kind":...,"setFilters":{...},"clearFilters":[...],"reference":...,"clarifyReason":...,"unsupportedClauses":[...]}`,
    `kind is one of: ${KINDS.join(" | ")}`,
    "Use search for an explicit new vehicle topic or a broad inventory search. Use refine only when the message narrows or edits the active search without introducing a new named vehicle topic.",
    "Use reset when the visitor asks for all/whole/entire inventory or explicitly abandons the current filters. Use present only to display the current result set again.",
    "Use reference for an ordinal, last item, selected item, or positional comparison. Use selected_followup only for a question about the already selected vehicle. Use lead_form for a request to start a supported contact/lead form.",
    "Use clarify when the meaning cannot be represented safely; choose the closest bounded clarifyReason. Use unsupported only when no supported intent remains.",
    `setFilters keys: ${INTERPRETABLE_FILTER_KEYS.join(", ")}. Numbers for year, yearMin, yearMax, mileageMax, priceMin, priceMax; strings otherwise. Include ONLY what this message states.`,
    "Normalize common vehicle makes and inventory facets to their conventional display spelling. Convert monetary or mileage suffixes such as 40k to 40000. 'Under', 'up to', 'budget', and 'at most' set a maximum; 'over', 'at least', and 'starting at' set a minimum.",
    "clearFilters lists fields the visitor explicitly dropped, e.g. 'any year', 'not Toyota'.",
    'reference is {"kind":"ordinal","position":N} | {"kind":"last"} | {"kind":"selected"} | {"kind":"compare","positions":[N,M]} | null.',
    `clarifyReason is one of ${INTERPRETATION_CLARIFY_REASONS.join(" | ")} when kind is clarify, otherwise null.`,
    "unsupportedClauses holds any part of the request this schema cannot express. Never drop a clause silently.",
    "Never invent a make, model, price or vehicle the visitor did not mention.",
  ].join("\n");
}
