import type { VehicleQueryFilters } from "@lume/rag";
import type { ResolvedChatProvider } from "./chatProviderResolution";
import type {
  ChatInterpretation,
  InterpretationClarifyReason,
} from "./chatInterpretation";

export type CompiledChatInterpretation = {
  userText: string;
  filters: VehicleQueryFilters;
  clearFilters: readonly (keyof VehicleQueryFilters)[];
  hasInventoryIntent: boolean;
  clarification: string | null;
  rule: string;
};

const CLARIFICATION_COPY: Record<InterpretationClarifyReason, string> = {
  ambiguous_affirmation:
    "I want to make sure I take the right direction. Which option do you mean?",
  ambiguous_make:
    "Which make would you like to see? You can also ask for the full inventory.",
  ambiguous_reference:
    "Which result do you mean? Please give me its position in the current list.",
  conflicting_constraints:
    "Those constraints conflict. Which price or year range should I use?",
  relative_constraint:
    "What exact limit should I use—for example, under $40,000 or under 30,000 miles?",
  unsupported_request:
    "I can help with inventory, vehicle details, navigation, and dealership questions. What would you like me to check?",
};

/**
 * Compile meaning into inputs the existing deterministic pipeline already
 * understands. This function cannot produce an id, URL, action or query.
 */
export function compileChatInterpretation(
  interpretation: ChatInterpretation,
  originalUserText: string,
): CompiledChatInterpretation | null {
  // Never execute half a request. The normal grounded model/tool path gets a
  // chance to handle the complete request instead.
  if (interpretation.unsupportedClauses.length > 0) return null;

  switch (interpretation.kind) {
    case "search":
      return {
        // "start over" invokes the existing full-scope reset before merging
        // the model's validated, explicit current-turn filters.
        userText: "start over with inventory",
        filters: interpretation.setFilters as VehicleQueryFilters,
        clearFilters: interpretation.clearFilters,
        hasInventoryIntent: true,
        clarification: null,
        rule: "interpreted_search",
      };
    case "refine":
      return {
        userText: originalUserText,
        filters: interpretation.setFilters as VehicleQueryFilters,
        clearFilters: interpretation.clearFilters,
        hasInventoryIntent: true,
        clarification: null,
        rule: "interpreted_refinement",
      };
    case "reset":
      return {
        userText: "show me all inventory",
        filters: {},
        clearFilters: [],
        hasInventoryIntent: true,
        clarification: null,
        rule: "interpreted_reset",
      };
    case "present":
      return {
        userText: "show me",
        filters: {},
        clearFilters: [],
        hasInventoryIntent: true,
        clarification: null,
        rule: "interpreted_presentation",
      };
    case "reference": {
      const reference = interpretation.reference;
      if (!reference) return null;
      if (reference.kind === "compare") {
        const comparison = compareText(reference.positions);
        if (!comparison) return null;
        return {
          userText: comparison,
          filters: {},
          clearFilters: [],
          hasInventoryIntent: true,
          clarification: null,
          rule: "interpreted_comparison",
        };
      }
      const navigate = explicitlyRequestsNavigation(originalUserText);
      if (reference.kind === "selected" && !navigate) return null;
      const referenceText =
        reference.kind === "ordinal"
          ? `${navigate ? "open " : ""}the ${ordinal(reference.position)} one`
          : reference.kind === "last"
            ? `${navigate ? "open " : ""}the last one`
            : navigate
              ? "open it"
              : "this one";
      return {
        userText: referenceText,
        filters: {},
        clearFilters: [],
        hasInventoryIntent: true,
        clarification: null,
        rule: "interpreted_reference",
      };
    }
    case "clarify":
      return interpretation.clarifyReason
        ? {
            userText: originalUserText,
            filters: {},
            clearFilters: [],
            hasInventoryIntent: false,
            clarification: CLARIFICATION_COPY[interpretation.clarifyReason],
            rule: `interpreted_clarification:${interpretation.clarifyReason}`,
          }
        : null;
    case "selected_followup":
    case "lead_form":
    case "unsupported":
      return null;
  }
}

/** Models enter this list only after passing the versioned held-out gate. */
export const CERTIFIED_CONTEXTUAL_INTERPRETER_MODELS: readonly string[] = [];

/** Active rollout requires certification, the environment gate and an exact tenant allowlist. */
export function isContextualInterpretationEnabled(
  tenantSlug: string,
  modelId: string,
  flag: string | undefined = process.env.CONCIERGE_CONTEXTUAL_INTERPRETER,
  allowlist: string | undefined = process.env
    .CONCIERGE_CONTEXTUAL_INTERPRETER_TENANTS,
  certifiedModels: readonly string[] = CERTIFIED_CONTEXTUAL_INTERPRETER_MODELS,
): boolean {
  if (!certifiedModels.includes(modelId)) return false;
  if (flag?.trim().toLowerCase() !== "true") return false;
  return (allowlist ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(tenantSlug.trim().toLowerCase());
}

/**
 * An interpreter is certified for the exact model that was evaluated, never
 * for a provider family. If dashboard selection falls back because its key is
 * absent, preserve normal chat availability but keep interpretation disabled:
 * otherwise an unmeasured model could silently start steering state.
 */
export function isResolvedContextualInterpretationEnabled(
  tenantSlug: string,
  provider: Pick<ResolvedChatProvider, "profile" | "fellBack"> | null,
  flag: string | undefined = process.env.CONCIERGE_CONTEXTUAL_INTERPRETER,
  allowlist: string | undefined = process.env
    .CONCIERGE_CONTEXTUAL_INTERPRETER_TENANTS,
  certifiedModels: readonly string[] = CERTIFIED_CONTEXTUAL_INTERPRETER_MODELS,
): boolean {
  return Boolean(
    provider &&
      !provider.fellBack &&
      isContextualInterpretationEnabled(
        tenantSlug,
        provider.profile.id,
        flag,
        allowlist,
        certifiedModels,
      ),
  );
}

function explicitlyRequestsNavigation(text: string): boolean {
  return /\b(?:open|view|select|choose|take\s+me\s+to|go\s+to|bring\s+up|pull\s+up)\b/i.test(
    text,
  );
}

function compareText(positions: readonly number[]): string | null {
  const sequential = positions.every(
    (position, index) => position === index + 1,
  );
  if (sequential && positions.length >= 2 && positions.length <= 4) {
    const count = ["", "", "two", "three", "four"][positions.length];
    return `compare the first ${count}`;
  }
  if (positions.length !== 2) return null;
  const [first, ...rest] = positions.map(
    (position) => `the ${ordinal(position)} one`,
  );
  return `compare ${first} ${rest.map((value) => `and ${value}`).join(" ")}`;
}

function ordinal(position: number): string {
  const mod100 = position % 100;
  const suffix =
    mod100 >= 11 && mod100 <= 13
      ? "th"
      : position % 10 === 1
        ? "st"
        : position % 10 === 2
          ? "nd"
          : position % 10 === 3
            ? "rd"
            : "th";
  return `${position}${suffix}`;
}
