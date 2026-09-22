import type { VehicleQueryFilters } from "@lume/rag";
import type { ConversationInventoryState } from "./chatConversationState";
import {
  INTERPRETABLE_FILTER_KEYS,
  type ChatInterpretation,
  type InterpretableFilterKey,
} from "./chatInterpretation";

/**
 * Shadow mode for the Phase 3 interpreter.
 *
 * The candidate interpretation is generated, compared against what the
 * deterministic layer actually did, and recorded — and then thrown away. It
 * executes nothing, mutates no memory, emits no action, and cannot change a
 * single byte of the visitor's response. That is the whole point: we get
 * evidence about whether a model would have understood the sentence better,
 * at zero risk to the conversation, before anyone decides to trust it.
 *
 * Nothing here records raw visitor text. A disagreement is described by which
 * FIELDS differed, never by what the visitor said.
 */

/** Bounded, identity-free description of the turn, for the interpreter. */
export type InterpreterContext = {
  surface: "public";
  activeFilters: VehicleQueryFilters;
  resultSetSize: number;
  hasSelection: boolean;
  /** Present only so "the second one" has a range to be valid within. */
  resultSetTotal: number | null;
  deterministicFilters: VehicleQueryFilters;
  pendingClarification: string | null;
};

/**
 * Build what the interpreter is allowed to see.
 *
 * Shape and the visitor's own current constraints — never the catalogue,
 * never conversation history, never a lead, never a credential. The
 * interpreter's job is to read one sentence; everything else would be an
 * invitation to reason about data it has no business holding.
 */
export function buildInterpreterContext(input: {
  state: ConversationInventoryState;
  deterministicFilters: VehicleQueryFilters;
}): InterpreterContext {
  const { state, deterministicFilters } = input;
  return {
    surface: "public",
    activeFilters: pickInterpretableFilters(state.activeFilters),
    resultSetSize: state.resultSet?.orderedIds.length ?? 0,
    resultSetTotal: state.resultSet?.totalCount ?? null,
    hasSelection: state.selectedVehicleId !== null,
    deterministicFilters: pickInterpretableFilters(deterministicFilters),
    pendingClarification: state.pendingClarification?.kind ?? null,
  };
}

/** Render the context for a prompt. Vehicle ids never appear. */
export function buildInterpreterContextPrompt(context: InterpreterContext): string {
  const lines = [
    `Active search: ${describeFiltersForPrompt(context.activeFilters)}`,
    `Results currently on screen: ${context.resultSetSize}${
      context.resultSetTotal !== null ? ` of ${context.resultSetTotal} matching` : ""
    }`,
    `A vehicle is currently selected: ${context.hasSelection ? "yes" : "no"}`,
  ];
  if (context.pendingClarification) {
    lines.push(`Awaiting an answer to a ${context.pendingClarification} question`);
  }
  return ["Conversation context (shape only):", ...lines.map((l) => `- ${l}`)].join("\n");
}

function describeFiltersForPrompt(filters: VehicleQueryFilters): string {
  const parts = INTERPRETABLE_FILTER_KEYS.flatMap((key) => {
    const value = filters[key];
    return value === undefined || value === null ? [] : [`${key}=${String(value)}`];
  });
  return parts.length > 0 ? parts.join(", ") : "none";
}

function pickInterpretableFilters(filters: VehicleQueryFilters): VehicleQueryFilters {
  const out: VehicleQueryFilters = {};
  for (const key of INTERPRETABLE_FILTER_KEYS) {
    const value = filters[key];
    if (value !== undefined && value !== null) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

/** What the deterministic layer concluded, in the interpreter's vocabulary. */
export type DeterministicOutcome = {
  kind: ChatInterpretation["kind"];
  filters: VehicleQueryFilters;
  hasReference: boolean;
};

export type ShadowComparison = {
  /** Same intent kind on both sides. */
  kindAgrees: boolean;
  deterministicKind: ChatInterpretation["kind"];
  candidateKind: ChatInterpretation["kind"];
  /** Filter fields where the two disagree. Field NAMES only, never values. */
  filterFieldsDiffering: InterpretableFilterKey[];
  referenceAgrees: boolean;
  /** The candidate saw part of the request the deterministic layer dropped. */
  candidateRetainedUnsupported: boolean;
  candidateClarifies: boolean;
};

/**
 * Compare the two readings of one turn.
 *
 * A disagreement is not automatically a deterministic error OR a candidate
 * error — it is a case for a human to adjudicate against the gold set. The
 * record is shaped to make that possible without ever storing what was said.
 */
export function compareShadowInterpretation(input: {
  deterministic: DeterministicOutcome;
  candidate: ChatInterpretation;
}): ShadowComparison {
  const { deterministic, candidate } = input;
  const filterFieldsDiffering = INTERPRETABLE_FILTER_KEYS.filter((key) => {
    const left = deterministic.filters[key];
    const right = candidate.setFilters[key];
    const leftSet = left !== undefined && left !== null;
    const rightSet = right !== undefined && right !== null;
    if (!leftSet && !rightSet) return false;
    if (leftSet !== rightSet) return true;
    return String(left).trim().toLowerCase() !== String(right).trim().toLowerCase();
  });

  return {
    kindAgrees: deterministic.kind === candidate.kind,
    deterministicKind: deterministic.kind,
    candidateKind: candidate.kind,
    filterFieldsDiffering,
    referenceAgrees: deterministic.hasReference === (candidate.reference !== null),
    candidateRetainedUnsupported: candidate.unsupportedClauses.length > 0,
    candidateClarifies: candidate.kind === "clarify",
  };
}

/**
 * Shadow interpretation is opt-in per environment, and then per tenant.
 *
 * Two gates rather than one: the environment flag keeps it off everywhere by
 * default, and the allowlist keeps an enabled environment from silently
 * spending a model call on every tenant's every unresolved turn.
 */
export function isShadowInterpretationEnabled(
  tenantSlug: string,
  flag: string | undefined = process.env.CONCIERGE_SHADOW_INTERPRETER,
  allowlist: string | undefined = process.env.CONCIERGE_SHADOW_INTERPRETER_TENANTS,
): boolean {
  if (flag?.trim().toLowerCase() !== "true") return false;
  const allowed = (allowlist ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(tenantSlug.trim().toLowerCase());
}
