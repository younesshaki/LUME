import type { BotAction, Vehicle } from "@lume/types";
import type { VehicleQueryFilters } from "@lume/rag";

export type ConversationResultSet = {
  orderedIds: string[];
  totalCount: number;
  filtersApplied: VehicleQueryFilters;
  createdAtTurn: number;
};

export type ConversationInventoryState = {
  activeFilters: VehicleQueryFilters;
  resultSet: ConversationResultSet | null;
  selectedVehicleId: string | null;
  turn: number;
  /** Last inventory-intent timestamp; non-inventory chat must not refresh it. */
  lastInventoryActivityAt: string | null;
};

export type InventoryStateTransition = {
  state: ConversationInventoryState;
  shouldQuery: boolean;
  useStoredResultSet: boolean;
  rules: string[];
};

const FILTER_KEYS = [
  "make", "model", "bodyStyle", "stockType", "fuelType", "drivetrain",
  "sellerState", "sellerCity", "year", "yearMin", "yearMax", "mileageMax",
  "priceMin", "priceMax", "sort",
] as const satisfies readonly (keyof VehicleQueryFilters)[];

export const INVENTORY_SCOPE_STALE_AFTER_MS = 30 * 60 * 1_000;
export const INVENTORY_SCOPE_STALE_AFTER_TURNS = 7;

// "all makes" and "different/another make" are as explicit a reset signal as
// "all inventory" — live-reproduced 2026-07-22: this phrasing silently failed
// to match, so the concierge stayed pinned to a dead filter combination with
// no way out short of the exact words "all inventory". "Whole"/"entire" are
// the same intent (live-reproduced 2026-07-23: "back to the whole inventory"
// kept a stale make+price scope and answered 6 BMWs instead of the real
// 1,283-vehicle inventory). Filter-explicit resets ("forget the filters",
// "no filters") must clear EVERYTHING — live-reproduced 2026-07-23: the
// weaker make/model-only clear let a $70k cap survive, shrinking the "full"
// inventory to 1,142. The "everything" forms are end-anchored so "show me
// everything about it" (a selected-vehicle question) never misfires.
const FULL_INVENTORY_RESET_PATTERN = new RegExp(
  [
    "\\b(?:(?:all|whole|entire|full|complete)\\s+(?:inventory|vehicles|cars|makes|stock)|in\\s+general|regardless\\s+of\\s+(?:make|brand)|(?:a\\s+|any\\s+)?(?:different|another)\\s+make)\\b",
    "\\b(?:forget|clear|reset|remove|drop)\\s+(?:about\\s+)?(?:the\\s+|all\\s+|these\\s+|those\\s+|your\\s+)?filters?\\b",
    "\\bno\\s+filters?\\b",
    "(?:show|browse|view)\\s+(?:me\\s+)?everything\\s*[.!?]*$",
    "\\beverything\\s+you\\s+(?:have|got)\\b",
    "\\bstart(?:ing)?\\s+(?:over|from\\s+scratch|fresh)\\b",
  ].join("|"),
  "i",
);
const SCOPE_RESET_PATTERN = new RegExp(
  `${FULL_INVENTORY_RESET_PATTERN.source}|(?:not|without|except)\\s+(?:talking\\s+about\\s+)?(?:a\\s+)?[a-z][a-z-]*|no\\s+(?!more\\b|less\\b)(?:talking\\s+about\\s+)?(?:a\\s+)?[a-z][a-z-]*|forget\\s+(?:about\\s+)?[a-z][a-z-]*`,
  "i",
);
const PRESENTATION_PATTERN = /^(?:show\s+me|(?:show|browse|view)\s+(?:me\s+)?(?:them|those|the\s+(?:results|list|inventory)))\s*[.!?]*$/i;
// Spelled-out AND numeral ordinals must both reach the deterministic path —
// live-reproduced 2026-07-23: "open the 3rd one" fell through to the model,
// which either failed loudly ("vehicle ID could not be verified") or, worse,
// confidently opened the WRONG vehicle (the 4th result). A numeral cannot be
// left for the model to improvise: position-in-list is a lookup, never a guess.
const ORDINAL_WORDS: Record<string, number> = {
  first: 0, second: 1, third: 2, fourth: 3, fifth: 4,
  sixth: 5, seventh: 6, eighth: 7, ninth: 8, tenth: 9,
};
const ORDINAL_TOKEN_PATTERN = "(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|\\d{1,2}(?:st|nd|rd|th))";
const ORDINAL_REFERENCE_PATTERN = new RegExp(`\\b(?:the\\s+)?${ORDINAL_TOKEN_PATTERN}\\s+(?:one|vehicle|car|listing)\\b`, "i");
const ORDINAL_ACTION_PATTERN = new RegExp(`\\b(?:open|show|view|take\\s+me\\s+to)\\s+(?:the\\s+)?${ORDINAL_TOKEN_PATTERN}\\s+(?:one|vehicle|car|listing)\\b`, "i");
// "#3" / "number 3" — standalone or with an explicit open/show verb.
const ORDINAL_STANDALONE_PATTERN = /^(?:(?:open|show|view)\s+(?:me\s+)?)?(?:#|number\s+)(\d{1,2})\s*[.!?]*$/i;
const SELECTED_ACTION_PATTERN = /\b(?:open|show|view|take\s+me\s+to)\s+(?:it|this(?:\s+(?:one|vehicle|car))?|that(?:\s+(?:one|vehicle|car))?)\b/i;
// "compare the first two" / "compare the first and the third" — comparisons
// of result-set positions resolve deterministically from the stored list,
// never via the model guessing (live-reproduced 2026-07-23: left to the
// model, it claimed the just-listed vehicles "aren't in the dataset" and
// asked the visitor which cars they meant).
const COMPARE_COUNT_PATTERN = /\bcompare\s+(?:the\s+)?first\s+(two|three|four)\b/i;
const COMPARE_PAIR_PATTERN = /\bcompare\s+(?:the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d{1,2}(?:st|nd|rd|th)|#\d{1,2})\s*(?:one|vehicle|car|listing)?\s+(?:and|with|to|against|vs\.?|versus)\s+(?:the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d{1,2}(?:st|nd|rd|th)|#\d{1,2})\s*(?:one|vehicle|car|listing)?\b/i;

export function emptyConversationInventoryState(): ConversationInventoryState {
  return {
    activeFilters: {},
    resultSet: null,
    selectedVehicleId: null,
    turn: 0,
    lastInventoryActivityAt: null,
  };
}

export function normalizeConversationInventoryState(value: unknown): ConversationInventoryState {
  if (!isRecord(value)) return emptyConversationInventoryState();
  const activeFilters = pickFilters(value.activeFilters);
  const resultSet = normalizeResultSet(value.resultSet);
  const selectedCandidate = typeof value.selectedVehicleId === "string"
    ? value.selectedVehicleId
    : null;
  const selectedVehicleId = resultSet?.orderedIds.includes(selectedCandidate ?? "")
    ? selectedCandidate
    : null;
  const turnValue = value.turn;
  const turn = typeof turnValue === "number" && Number.isSafeInteger(turnValue) && turnValue >= 0
    ? turnValue
    : 0;
  const lastInventoryActivityAt =
    typeof value.lastInventoryActivityAt === "string" &&
    Number.isFinite(Date.parse(value.lastInventoryActivityAt))
      ? value.lastInventoryActivityAt
      : null;
  return {
    activeFilters,
    resultSet,
    selectedVehicleId,
    turn,
    lastInventoryActivityAt,
  };
}

export type InventoryTransitionContext = {
  nowMs: number;
};

/** A new visitor turn only changes filters the visitor explicitly supplied. */
export function transitionInventoryState(
  current: ConversationInventoryState,
  userText: string,
  extractedFilters: VehicleQueryFilters,
  hasInventoryIntent: boolean,
  context?: InventoryTransitionContext,
): InventoryStateTransition {
  const nextTurn = current.turn + 1;
  const resetScope = hasScopeResetIntent(userText);
  const normalizedExtracted = pickFilters(extractedFilters);
  const clearsStaleBroadScope = shouldStartFreshBroadInventorySearch(
    current,
    userText,
    normalizedExtracted,
    context?.nowMs,
  );
  // Naming a different make starts a new search for that make. A model AND a
  // model year are tied to the specific vehicle the visitor had in mind — a
  // prior "2026 Camry" must not silently survive into "what about a caddy?"
  // (dropping Camry) or into "BMW SUVs under 70k" three turns later (dropping
  // year:2026, which previously forced a real BMW match to a false zero-result
  // — reproduced live 2026-07-22). Body style, price, drivetrain, mileage, and
  // location read as standing visitor preferences and are intentionally kept.
  const switchesMake =
    normalizedExtracted.make !== undefined &&
    current.activeFilters.make !== undefined &&
    normalizedExtracted.make !== current.activeFilters.make;
  const clearsStrandedModel =
    normalizedExtracted.make !== undefined &&
    normalizedExtracted.model === undefined &&
    current.activeFilters.model !== undefined &&
    current.activeFilters.make !== normalizedExtracted.make;
  // Catalog extraction can identify "Camry" without its make. If a make from
  // an older query is active, preserving it fabricates an impossible combined
  // scope (live: BMW + Camry). An explicitly different model is authoritative:
  // discard the old named-vehicle scope while preserving generic preferences.
  const switchesModelWithoutMake =
    normalizedExtracted.model !== undefined &&
    normalizedExtracted.make === undefined &&
    current.activeFilters.make !== undefined &&
    normalizedExtracted.model !== current.activeFilters.model;
  const clearsVehicleScope =
    switchesMake || clearsStrandedModel || switchesModelWithoutMake;
  const base = clearsStaleBroadScope
    ? {}
    : resetScope
    ? clearScopeFilters(current.activeFilters, userText)
    : switchesModelWithoutMake
      ? dropNamedVehicleScope(current.activeFilters)
      : clearsVehicleScope
        ? dropVehicleSpecificScope(current.activeFilters)
        : current.activeFilters;
  const activeFilters = mergeFilters(base, normalizedExtracted);
  const hasExplicitFilters = Object.keys(normalizedExtracted).length > 0 || resetScope;
  const useStoredResultSet = !hasExplicitFilters && isPresentationRequest(userText) && current.resultSet !== null;
  const ordinal = ordinalResultSetVehicleId(userText, current.resultSet);
  const selectedAction = selectedResultSetVehicleId(userText, current);
  const rules = [
    ...(resetScope ? ["clear_make_model_scope"] : []),
    ...(clearsStaleBroadScope ? ["clear_stale_scope_for_broad_query"] : []),
    ...(!resetScope && !clearsStaleBroadScope && switchesModelWithoutMake
      ? ["clear_make_on_model_change"]
      : []),
    ...(!resetScope && !clearsStaleBroadScope && !switchesModelWithoutMake && clearsVehicleScope
      ? ["clear_model_on_make_change"]
      : []),
    ...(useStoredResultSet ? ["reuse_result_set"] : []),
    ...(ordinal ? ["ordinal_from_result_set"] : []),
    ...(selectedAction ? ["selected_vehicle_from_result_set"] : []),
  ];
  return {
    state: {
      ...current,
      activeFilters,
      turn: nextTurn,
      ...(hasInventoryIntent && context
        ? { lastInventoryActivityAt: new Date(context.nowMs).toISOString() }
        : {}),
      // A scope reset abandons whatever was on screen: the verified selection
      // and the stored result list belong to the old scope. Live-reproduced
      // 2026-07-23 (session 2c19e8d4): a selection made two turns earlier
      // survived a filter change and a full reset, leaked into the next
      // turn's grounding, and the model narrated the old Jeep instead of the
      // reset inventory. The route re-queries and rebuilds the result set on
      // reset turns anyway, so this only removes stale state.
      ...(resetScope || clearsStaleBroadScope
        ? { selectedVehicleId: null, resultSet: null }
        : {}),
    },
    shouldQuery: hasInventoryIntent && !useStoredResultSet && !ordinal && !selectedAction,
    useStoredResultSet,
    rules,
  };
}

export function setConversationResultSet(
  state: ConversationInventoryState,
  vehicles: readonly Pick<Vehicle, "id">[],
  totalCount: number,
): ConversationInventoryState {
  return {
    ...state,
    resultSet: {
      orderedIds: vehicles.map((vehicle) => vehicle.id),
      totalCount,
      filtersApplied: { ...state.activeFilters },
      createdAtTurn: state.turn,
    },
  };
}

/**
 * A refinement that matches nothing must not become sticky. Without rolling
 * activeFilters back to how they stood before this turn, every zero-yield
 * facet ("AWD", then "2026", ...) permanently compounds onto the next turn —
 * live-reproduced 2026-07-22: BMW SUV <70k -> AWD -> 2026 accumulated into an
 * unrecoverable dead filter combo that no later turn (even repeating the same
 * make) could escape without the visitor guessing "all inventory" verbatim.
 * The result-set snapshot and turn counter are still preserved for continuity.
 */
export function preserveResultSetForZeroResults(
  state: ConversationInventoryState,
  priorFilters: VehicleQueryFilters,
): ConversationInventoryState {
  return { ...state, activeFilters: priorFilters };
}

export function selectConversationVehicle(
  state: ConversationInventoryState,
  vehicleId: string,
): ConversationInventoryState {
  return isVehicleInCurrentResultSet(state, vehicleId)
    ? { ...state, selectedVehicleId: vehicleId }
    : state;
}

export function isPresentationRequest(userText: string): boolean {
  return PRESENTATION_PATTERN.test(userText.trim());
}

/** Never infer which branch a bare "yes" accepts after a two-option question. */
export function isAmbiguousAffirmation(
  userText: string,
  previousAssistantText: string | null,
): boolean {
  if (!/^(?:yes|yeah|yep|sure|okay|ok|please do)[.! ]*$/i.test(userText.trim())) return false;
  if (!previousAssistantText) return false;
  return /\?/.test(previousAssistantText) && /\b(?:or|either)\b/i.test(previousAssistantText);
}

export function hasScopeResetIntent(userText: string): boolean {
  return SCOPE_RESET_PATTERN.test(userText);
}

export function hasFullInventoryResetIntent(userText: string): boolean {
  return FULL_INVENTORY_RESET_PATTERN.test(userText);
}

const DIFFERENT_MAKE_PATTERN = /\b(?:a\s+|any\s+)?(?:different|another)\s+make\b/i;

/**
 * "What about a different make?" with NO make named is ambiguous: the right
 * move is a clarifying question, never volunteering the old make's results
 * in the same breath — live-reproduced 2026-07-23: the model asked "which
 * make?" and then listed the old BMW SUVs underneath its own question.
 */
export function isAmbiguousMakeSwitchRequest(
  userText: string,
  extractedFilters: VehicleQueryFilters,
): boolean {
  return DIFFERENT_MAKE_PATTERN.test(userText) && extractedFilters.make === undefined;
}

/** Zero-based index for one ordinal token (word, numeral, or #N). */
function ordinalTokenToIndex(token: string): number | null {
  const normalized = token.toLowerCase();
  const word = ORDINAL_WORDS[normalized];
  if (word !== undefined) return word;
  const numeral = /^(\d{1,2})(?:st|nd|rd|th)$/.exec(normalized);
  if (numeral) return Number(numeral[1]) - 1;
  const hash = /^#(\d{1,2})$/.exec(normalized);
  return hash ? Number(hash[1]) - 1 : null;
}

/** The parsed ordinal: a zero-based index, "last", or null when none is present. */
function ordinalReferenceFromText(userText: string): number | "last" | null {
  const withNoun = ORDINAL_REFERENCE_PATTERN.exec(userText);
  const token = withNoun?.[1];
  if (token) {
    if (token.toLowerCase() === "last") return "last";
    const index = ordinalTokenToIndex(token);
    if (index !== null) return index;
  }
  const standalone = ORDINAL_STANDALONE_PATTERN.exec(userText.trim());
  if (standalone?.[1]) return Number(standalone[1]) - 1;
  return null;
}

/**
 * Zero-based result-set positions named in a comparison request:
 * "compare the first two|three|four" or "compare the first and the third"
 * (also numeral/#N forms). Null when there is no comparison, the form is
 * unparseable, or both positions are the same.
 */
export function compareOrdinalIndexesFromText(userText: string): number[] | null {
  const countMatch = COMPARE_COUNT_PATTERN.exec(userText);
  if (countMatch?.[1]) {
    const word = countMatch[1].toLowerCase();
    const count = word === "two" ? 2 : word === "three" ? 3 : 4;
    return Array.from({ length: count }, (_, index) => index);
  }
  const pairMatch = COMPARE_PAIR_PATTERN.exec(userText);
  if (!pairMatch?.[1] || !pairMatch[2]) return null;
  const first = ordinalTokenToIndex(pairMatch[1]);
  const second = ordinalTokenToIndex(pairMatch[2]);
  if (first === null || second === null || first === second) return null;
  return [first, second];
}

export function ordinalResultSetVehicleId(
  userText: string,
  resultSet: ConversationResultSet | null,
): string | null {
  const reference = ordinalReferenceFromText(userText);
  if (reference === null || !resultSet || resultSet.orderedIds.length === 0) return null;
  // “Last” is unsafe when the query has more matches than the bounded
  // snapshot. Never silently substitute the last stored page item.
  if (reference === "last" && resultSet.totalCount > resultSet.orderedIds.length) return null;
  const index = reference === "last" ? resultSet.orderedIds.length - 1 : reference;
  return resultSet.orderedIds[index] ?? null;
}

/** An ordinal was used and a result set exists, but the position is beyond it. */
export function isOutOfRangeOrdinalReference(
  userText: string,
  resultSet: ConversationResultSet | null,
): boolean {
  const reference = ordinalReferenceFromText(userText);
  return reference !== null &&
    reference !== "last" &&
    Boolean(resultSet && resultSet.orderedIds.length > 0) &&
    reference >= (resultSet?.orderedIds.length ?? 0);
}

/** Navigation is only appropriate when the visitor explicitly asked to open it. */
export function isOrdinalVehicleActionRequest(userText: string): boolean {
  return ORDINAL_ACTION_PATTERN.test(userText) || ORDINAL_STANDALONE_PATTERN.test(userText.trim());
}

export function isOrdinalVehicleReference(userText: string): boolean {
  return ORDINAL_REFERENCE_PATTERN.test(userText) || ORDINAL_STANDALONE_PATTERN.test(userText.trim());
}

export function isTruncatedLastOrdinalReference(
  userText: string,
  resultSet: ConversationResultSet | null,
): boolean {
  return /\b(?:the\s+)?last\s+(?:one|vehicle|car|listing)\b/i.test(userText) &&
    Boolean(resultSet && resultSet.totalCount > resultSet.orderedIds.length);
}

export function isSelectedVehicleActionRequest(userText: string): boolean {
  return SELECTED_ACTION_PATTERN.test(userText);
}

/** Resolve “open it” only from a selected, current result-set vehicle. */
export function selectedResultSetVehicleId(
  userText: string,
  state: ConversationInventoryState,
): string | null {
  return isSelectedVehicleActionRequest(userText) &&
    isVehicleInCurrentResultSet(state, state.selectedVehicleId)
    ? state.selectedVehicleId
    : null;
}

/** Common deictic vehicle-detail requests that can use the selected snapshot. */
export function isSelectedVehicleDetailRequest(userText: string): boolean {
  return /\b(?:tell\s+me\s+more\s+about|details?\s+(?:on|about|for)|how\s+much(?:\s+is|\s+does)?|how\s+many\s+(?:miles|mileage)(?:\s+does)?|what(?:'s|\s+is)\s+(?:the\s+)?(?:price|mileage|miles|location)|where\s+is|is\s+(?:it|this|that)\s+(?:available|awd|fwd|rwd|electric|hybrid)|does\s+(?:it|this|that)\s+have\s+(?:awd|fwd|rwd|electric|hybrid))\b/i.test(userText) && /\b(?:it|this(?:\s+(?:one|vehicle|car))?|that(?:\s+(?:one|vehicle|car))?)\b/i.test(userText);
}

/** Questions whose answer must come from an explicit vehicle-data field. */
export function isUnsupportedVehicleFactRequest(userText: string): boolean {
  return /\b(?:reliab(?:le|ility)|accident|carfax|history|condition|maintenance|service\s+records?|heated\s+seats?|ventilated\s+seats?|options?|features?)\b/i.test(userText);
}

export function isVehicleInCurrentResultSet(
  state: ConversationInventoryState,
  vehicleId: string | null | undefined,
): boolean {
  return Boolean(vehicleId && state.resultSet?.orderedIds.includes(vehicleId));
}

export function vehicleSatisfiesActiveFilters(
  vehicle: Vehicle,
  filters: VehicleQueryFilters,
): boolean {
  const same = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase();
  const includes = (left: string, right: string) => left.toLowerCase().includes(right.trim().toLowerCase());
  if (filters.make && !same(vehicle.make, filters.make)) return false;
  if (filters.model && !includes(vehicle.model, filters.model)) return false;
  if (filters.bodyStyle && !same(vehicle.bodyStyle, filters.bodyStyle)) return false;
  if (filters.stockType && !same(vehicle.stockType, filters.stockType)) return false;
  if (filters.fuelType && !same(vehicle.fuelType, filters.fuelType)) return false;
  if (filters.drivetrain && !same(vehicle.drivetrain, filters.drivetrain)) return false;
  if (filters.sellerState && !same(vehicle.sellerState, filters.sellerState)) return false;
  if (filters.sellerCity && !same(vehicle.sellerCity, filters.sellerCity)) return false;
  if (filters.year !== undefined && vehicle.year !== filters.year) return false;
  if (filters.year === undefined && filters.yearMin !== undefined && vehicle.year < filters.yearMin) return false;
  if (filters.year === undefined && filters.yearMax !== undefined && vehicle.year > filters.yearMax) return false;
  if (filters.mileageMax !== undefined && (vehicle.mileage === null || vehicle.mileage > filters.mileageMax)) return false;
  if (filters.priceMin !== undefined && vehicle.price < filters.priceMin) return false;
  if (filters.priceMax !== undefined && vehicle.price > filters.priceMax) return false;
  return true;
}

/** Reject vehicle-bound actions unless they belong to the authoritative result set. */
export function filterActionsByConversationState(
  actions: readonly BotAction[],
  state: ConversationInventoryState,
  verifiedVehicleIds: readonly string[] = [],
): BotAction[] {
  return filterActionsByConversationStateWithDiagnostics(
    actions,
    state,
    verifiedVehicleIds,
  ).allowed;
}

export type ConversationActionDrop = {
  type: BotAction["type"];
  vehicleId: string | undefined;
  rule: "not_in_current_result_set" | "stale_result_set_filters";
};

/**
 * The result snapshot is authoritative only while it represents the active
 * filters. A zero-result refinement deliberately preserves the old snapshot
 * for conversational continuity; it must not make its old vehicles eligible
 * for a model-emitted action under the new constraints.
 */
export function filterActionsByConversationStateWithDiagnostics(
  actions: readonly BotAction[],
  state: ConversationInventoryState,
  verifiedVehicleIds: readonly string[] = [],
): { allowed: BotAction[]; dropped: ConversationActionDrop[] } {
  const verified = new Set(verifiedVehicleIds);
  const snapshotMatchesActiveFilters = filtersEqual(
    state.resultSet?.filtersApplied ?? {},
    state.activeFilters,
  );
  const allowed: BotAction[] = [];
  const dropped: ConversationActionDrop[] = [];

  for (const action of actions) {
    const vehicleIds = action.type === "compare_vehicles"
      ? action.vehicleIds
      : [action.type === "navigate-target"
        ? action.params?.vehicleId
        : action.type === "highlight-vehicle" || action.type === "open-lead-form" || action.type === "capture_lead"
          ? action.vehicleId
          : undefined].filter((value): value is string => Boolean(value));
    if (vehicleIds.length === 0) {
      allowed.push(action);
      continue;
    }
    const outOfSnapshot = vehicleIds.find((vehicleId) =>
      !verified.has(vehicleId) && !isVehicleInCurrentResultSet(state, vehicleId),
    );
    if (outOfSnapshot) {
      dropped.push({ type: action.type, vehicleId: outOfSnapshot, rule: "not_in_current_result_set" });
      continue;
    }
    // A route may explicitly verify an ordinal vehicle against the live
    // active filters. All other vehicle-bound actions depend on the snapshot.
    const hasUnverifiedVehicle = vehicleIds.some((vehicleId) => !verified.has(vehicleId));
    if (hasUnverifiedVehicle && !snapshotMatchesActiveFilters) {
      dropped.push({ type: action.type, vehicleId: vehicleIds[0], rule: "stale_result_set_filters" });
      continue;
    }
    allowed.push(action);
  }
  return { allowed, dropped };
}

function filtersEqual(
  left: VehicleQueryFilters,
  right: VehicleQueryFilters,
): boolean {
  const leftEntries = Object.entries(left).filter(([, value]) => value !== undefined);
  const rightEntries = Object.entries(right).filter(([, value]) => value !== undefined);
  return leftEntries.length === rightEntries.length && leftEntries.every(
    ([key, value]) => right[key as keyof VehicleQueryFilters] === value,
  );
}

function clearScopeFilters(filters: VehicleQueryFilters, userText: string): VehicleQueryFilters {
  if (FULL_INVENTORY_RESET_PATTERN.test(userText)) return {};
  const { make: _make, model: _model, ...remaining } = filters;
  return remaining;
}

/**
 * Drop the model and model-year — both describe the specific vehicle the
 * visitor had in mind, not a standing preference. Body style, price,
 * drivetrain, mileage, stock type, and location are retained.
 */
function dropVehicleSpecificScope(filters: VehicleQueryFilters): VehicleQueryFilters {
  const { model: _model, year: _year, yearMin: _yearMin, yearMax: _yearMax, ...remaining } = filters;
  return remaining;
}

function dropNamedVehicleScope(filters: VehicleQueryFilters): VehicleQueryFilters {
  const {
    make: _make,
    model: _model,
    bodyStyle: _bodyStyle,
    year: _year,
    yearMin: _yearMin,
    yearMax: _yearMax,
    ...remaining
  } = filters;
  return remaining;
}

/**
 * A price-only query naming generic cars/vehicles/inventory starts fresh once
 * the prior inventory scope is old. Immediate short refinements ("under 40k")
 * still inherit; only broad shopping language plus a time/turn boundary
 * prevents a model/year from 90 minutes and many unrelated turns ago leaking
 * into a new search.
 */
function shouldStartFreshBroadInventorySearch(
  current: ConversationInventoryState,
  userText: string,
  extractedFilters: VehicleQueryFilters,
  nowMs: number | undefined,
): boolean {
  const extractedKeys = Object.keys(extractedFilters);
  const isPriceOnly =
    extractedKeys.length > 0 &&
    extractedKeys.every((key) =>
      key === "priceMin" || key === "priceMax" || key === "sort"
    ) &&
    (extractedFilters.priceMin !== undefined ||
      extractedFilters.priceMax !== undefined);
  if (
    !isPriceOnly ||
    !/\b(?:cars?|vehicles?|inventory)\b/i.test(userText) ||
    Object.keys(current.activeFilters).length === 0
  ) {
    return false;
  }
  const lastInventoryAt = current.lastInventoryActivityAt
    ? Date.parse(current.lastInventoryActivityAt)
    : Number.NaN;
  const staleByTime =
    nowMs !== undefined &&
    Number.isFinite(lastInventoryAt) &&
    nowMs - lastInventoryAt >= INVENTORY_SCOPE_STALE_AFTER_MS;
  const staleByTurns =
    current.resultSet !== null &&
    current.turn - current.resultSet.createdAtTurn >=
      INVENTORY_SCOPE_STALE_AFTER_TURNS;
  return staleByTime || staleByTurns;
}

function mergeFilters(
  previous: VehicleQueryFilters,
  next: VehicleQueryFilters,
): VehicleQueryFilters {
  return { ...previous, ...next };
}

function pickFilters(value: unknown): VehicleQueryFilters {
  if (!isRecord(value)) return {};
  const out: VehicleQueryFilters = {};
  for (const key of FILTER_KEYS) {
    const candidate = value[key];
    if (candidate !== undefined) (out as Record<string, unknown>)[key] = candidate;
  }
  return out;
}

function normalizeResultSet(value: unknown): ConversationResultSet | null {
  if (!isRecord(value) || !Array.isArray(value.orderedIds) || typeof value.totalCount !== "number" || !Number.isSafeInteger(value.totalCount)) return null;
  const orderedIds = value.orderedIds.filter((id): id is string => typeof id === "string").slice(0, 30);
  if (orderedIds.length === 0 || value.totalCount < 0) return null;
  return {
    orderedIds,
    totalCount: value.totalCount,
    filtersApplied: pickFilters(value.filtersApplied),
    createdAtTurn: typeof value.createdAtTurn === "number" && Number.isSafeInteger(value.createdAtTurn) && value.createdAtTurn >= 0
      ? value.createdAtTurn
      : 0,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
