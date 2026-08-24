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
}): CompareOutcome {
  const { compareIndexes, orderedIds, fetched, activeFilters } = input;

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
}): ReferenceOutcome {
  const { userText, referencedVehicleId, fetched, activeFilters, resultSet } = input;

  if (referencedVehicleId) {
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
    inventory = inventoryResultAnswer(matchedVehicles, totalMatched);
    filterAction = inventoryFilterAction(filters);
  } else if (
    !availability &&
    totalMatched > 0 &&
    (isDirectInventoryPresentationRequest(userText, filters) ||
      isInventoryRecommendationRequest(userText))
  ) {
    inventory = isInventoryRecommendationRequest(userText)
      ? inventoryRecommendationAnswer(matchedVehicles, totalMatched)
      : inventoryResultAnswer(matchedVehicles, totalMatched);
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
