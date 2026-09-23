import type { BotAction, Vehicle } from "@lume/types";
import type { extractVehicleFilters } from "@lume/rag";
import {
  isOrdinalVehicleActionRequest,
  isOutOfRangeOrdinalReference,
  isSelectedVehicleActionRequest,
  isTruncatedLastOrdinalReference,
  vehicleSatisfiesActiveFilters,
  type ConversationInventoryState,
} from "./chatConversationState";
import {
  availabilityAnswerFromGroundedInventory,
  compareVehiclesAnswer,
  describeFilters,
  inventoryFilterAction,
  inventoryRecommendationAnswer,
  inventoryResultAnswer,
  isDirectInventoryPresentationRequest,
  isInventoryRecommendationRequest,
  ordinalVehicleReferenceAnswer,
  zeroResultAnswer,
} from "./chatAnswers";

/**
 * The public concierge's deterministic rules, separated from the I/O that
 * feeds them.
 *
 * These decisions used to live inline in POST as assignments to twelve
 * outer-scope `let` variables, spread across roughly 270 lines and interleaved
 * with Supabase reads and conversation-state mutation. Order-dependence that
 * worked by accident of statement order was invisible, and no rule could be
 * exercised without a Request, a tenant and a Supabase client.
 *
 * The seam is *fetch, then decide*: the route still owns every query and every
 * mutation; these functions take what was fetched and return what should
 * happen. Each is pure and total — same inputs, same outcome, no surprises
 * hiding in the middle of an await.
 *
 * Precedence between the resulting answers is a separate concern and lives in
 * chatDeterministicAnswer.ts.
 */

type VehicleFilters = ReturnType<typeof extractVehicleFilters>;

/* ------------------------------------------------------------------ *
 * Comparing two results ("compare the first two")
 * ------------------------------------------------------------------ */

export type CompareOutcome =
  | { kind: "unavailable"; answer: string }
  | { kind: "compared"; answer: string; groundedVehicleIds: readonly string[] };

/**
 * Comparisons resolve from the stored, verified list — never from the model
 * improvising. `fetched` is positional and may contain nulls for ids that no
 * longer resolve; a partial fetch is treated exactly like a filter mismatch,
 * because in both cases we cannot show a truthful side-by-side.
 */
export function resolveCompareOutcome(input: {
  compareIndexes: readonly number[];
  orderedIds: readonly string[];
  fetched: readonly (Vehicle | null)[];
  activeFilters: VehicleFilters;
  /** Same reasoning as resolveReferenceOutcome: positions are unsafe. */
  memoryDegraded?: boolean;
}): CompareOutcome {
  const { compareIndexes, orderedIds, fetched, activeFilters } = input;

  if (input.memoryDegraded) {
    return {
      kind: "unavailable",
      answer:
        "I’ve lost the thread of which results I showed you, so I can’t compare them by position right now. Tell me which two vehicles you mean and I’ll look them up.",
    };
  }

  if (orderedIds.length === 0) {
    return {
      kind: "unavailable",
      answer:
        "I don’t have a current result list to compare from yet — tell me what you’d like to search for first.",
    };
  }
  if (compareIndexes.some((index) => index >= orderedIds.length)) {
    return {
      kind: "unavailable",
      answer: `The current list has ${orderedIds.length} results — please compare numbers between 1 and ${orderedIds.length}.`,
    };
  }

  const compared = fetched.filter((vehicle): vehicle is Vehicle => Boolean(vehicle));
  const allResolved = compared.length === compareIndexes.length;
  const allSatisfyFilters = compared.every((vehicle) =>
    vehicleSatisfiesActiveFilters(vehicle, activeFilters),
  );

  if (allResolved && allSatisfyFilters) {
    return {
      kind: "compared",
      answer: compareVehiclesAnswer([...compareIndexes], compared),
      groundedVehicleIds: compared.map((vehicle) => vehicle.id),
    };
  }
  return {
    kind: "unavailable",
    answer:
      "Those results no longer satisfy your active filters, so I haven’t compared them. Would you like to relax a constraint or see the current matches?",
  };
}

/* ------------------------------------------------------------------ *
 * Resolving "the second one" / the selected vehicle
 * ------------------------------------------------------------------ */

export type ReferenceOutcome =
  /** The reference resolved and still satisfies the active filters. */
  | { kind: "resolved"; vehicle: Vehicle; answer: string | null }
  /** It resolved but no longer matches, or could not be resolved at all. */
  | { kind: "unavailable"; answer: string }
  /** No reference in this turn. */
  | { kind: "none" };

/**
 * A reference is only honoured while the vehicle still satisfies the active
 * filters — otherwise "open the second one" could navigate to something the
 * visitor has already filtered away.
 *
 * `answer` is null on a resolved *action* request ("take me to it"): the
 * navigation action carries the turn, and adding prose would duplicate it.
 */
export function resolveReferenceOutcome(input: {
  userText: string;
  referencedVehicleId: string | null;
  fetched: Vehicle | null;
  activeFilters: VehicleFilters;
  resultSet: ConversationInventoryState["resultSet"];
  hasOrdinalOrSelectionPhrase: boolean;
  /**
   * Set when the visitor's most recent inventory request matched nothing. The
   * filters rolled back so the conversation is not trapped, which means
   * activeFilters describe the PREVIOUS search — and those vehicles are
   * exactly the ones the visitor's latest ask excluded.
   */
  attemptedZeroResult?: ConversationInventoryState["attemptedZeroResult"];
  /**
   * True when the configured shared conversation store has failed and this
   * process is answering from per-instance memory.
   */
  memoryDegraded?: boolean;
}): ReferenceOutcome {
  const { userText, referencedVehicleId, fetched, activeFilters, resultSet } = input;

  // A reference resolves against a list this process believes it showed. When
  // the shared store is down that belief is unfounded: another instance served
  // the turn that built the list, so "the second one" may point at a position
  // in a list this visitor never saw. Refuse rather than open a plausible
  // wrong vehicle — the one failure mode this whole module exists to prevent.
  if (input.memoryDegraded && (referencedVehicleId || input.hasOrdinalOrSelectionPhrase)) {
    return {
      kind: "unavailable",
      answer:
        "I’ve lost the thread of which results I showed you, so I can’t safely open one by position right now. Tell me what you’re looking for and I’ll run the search again.",
    };
  }

  if (referencedVehicleId) {
    const attemptedZero = input.attemptedZeroResult ?? null;
    if (
      fetched &&
      attemptedZero &&
      !vehicleSatisfiesActiveFilters(fetched, attemptedZero.filters)
    ) {
      // "under $20k" matched nothing -> "open the second one" must not open a
      // $60k car from the search before it. The previous list is still on
      // screen, so this is the difference between a helpful recovery and
      // acting against the constraint the visitor just stated.
      return {
        kind: "unavailable",
        answer: `That result doesn’t meet ${describeFilters(attemptedZero.filters)}, which is what you last asked for — and nothing in stock does. Would you like to relax that, or open one of the earlier results instead?`,
      };
    }
    if (fetched && vehicleSatisfiesActiveFilters(fetched, activeFilters)) {
      const isActionRequest =
        isOrdinalVehicleActionRequest(userText) || isSelectedVehicleActionRequest(userText);
      return {
        kind: "resolved",
        vehicle: fetched,
        answer: isActionRequest ? null : ordinalVehicleReferenceAnswer(userText, fetched),
      };
    }
    return {
      kind: "unavailable",
      answer:
        "That result no longer satisfies your active filters, so I haven’t opened it. Would you like to relax a constraint or see the current matches?",
    };
  }

  if (!input.hasOrdinalOrSelectionPhrase) return { kind: "none" };

  // A reference with nothing to resolve against. Say which kind of nothing:
  // a truncated page, an out-of-range number, or no list at all.
  if (isTruncatedLastOrdinalReference(userText, resultSet)) {
    return {
      kind: "unavailable",
      answer: `There are ${resultSet?.totalCount ?? "more"} matching vehicles, but I only have the current result page safely anchored here. Please choose first, second, or third—or narrow the search.`,
    };
  }
  if (isOutOfRangeOrdinalReference(userText, resultSet)) {
    const size = resultSet?.orderedIds.length ?? 0;
    return {
      kind: "unavailable",
      answer: `The current list has ${size} results — please pick a number between 1 and ${size}.`,
    };
  }
  return {
    kind: "unavailable",
    answer:
      "I don’t have a current result list to safely resolve that reference. Please tell me what you’d like to search for.",
  };
}

/* ------------------------------------------------------------------ *
 * Answering a fresh inventory query
 * ------------------------------------------------------------------ */

export type InventoryOutcome = {
  zeroResult: string | null;
  availability: string | null;
  inventory: string | null;
  /** The UI filter action to emit, if any. */
  filterAction: BotAction | null;
  /** Roll conversation state back to the pre-turn filters. */
  rollBackToPreviousFilters: boolean;
};

/**
 * What to say — and what to filter the UI to — after querying inventory.
 *
 * A zero-result refinement rolls conversation state back to the filters that
 * last returned something, and returns early. Nothing below it can run,
 * because everything below it describes a search that has matches:
 *
 *  - the availability answer would be computed against an empty match set
 *  - a concurrent full-reset would emit a filter action pointing the UI at the
 *    dead combination, while the visitor reads "I've kept your previous
 *    results in place"
 *
 * That contradiction was visible on screen: rollback text above, empty
 * filtered inventory below. The early return is the fix — on a genuine
 * zero-result rollback there is nothing meaningful to filter to.
 */
export function resolveInventoryOutcome(input: {
  userText: string;
  filters: VehicleFilters;
  matchedVehicles: readonly Vehicle[];
  totalMatched: number;
  hasPriorResultSet: boolean;
  fullInventoryResetRequested: boolean;
}): InventoryOutcome {
  const {
    userText,
    filters,
    matchedVehicles,
    totalMatched,
    hasPriorResultSet,
    fullInventoryResetRequested,
  } = input;

  const isZeroResultRollback = totalMatched === 0 && hasPriorResultSet;

  if (isZeroResultRollback) {
    return {
      zeroResult: zeroResultAnswer(filters),
      availability: null,
      inventory: null,
      filterAction: null,
      rollBackToPreviousFilters: true,
    };
  }

  const availability = availabilityAnswerFromGroundedInventory(
    userText,
    filters,
    matchedVehicles,
    totalMatched,
  );

  let inventory: string | null = null;
  let filterAction: BotAction | null = null;

  if (fullInventoryResetRequested) {
    // A full reset changes the public inventory UI even when the filter object
    // is empty. Leaving this to the model let the assistant claim "all filters
    // cleared" while emitting no filter_inventory action at all.
    inventory = inventoryResultAnswer(matchedVehicles, totalMatched, filters);
    filterAction = inventoryFilterAction(filters);
  } else if (
    !availability &&
    totalMatched > 0 &&
    (isDirectInventoryPresentationRequest(userText, filters) ||
      isInventoryRecommendationRequest(userText))
  ) {
    inventory = isInventoryRecommendationRequest(userText)
      ? inventoryRecommendationAnswer(matchedVehicles, totalMatched)
      : inventoryResultAnswer(matchedVehicles, totalMatched, filters);
    filterAction = inventoryFilterAction(filters);
  }

  return {
    zeroResult: null,
    availability,
    inventory,
    filterAction,
    rollBackToPreviousFilters: false,
  };
}
