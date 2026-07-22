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

// "all makes" and "different/another make" are as explicit a reset signal as
// "all inventory" — live-reproduced 2026-07-22: this phrasing silently failed
// to match, so the concierge stayed pinned to a dead filter combination with
// no way out short of the exact words "all inventory".
const FULL_INVENTORY_RESET_PATTERN = /\b(?:all\s+(?:inventory|vehicles|cars|makes)|in\s+general|regardless\s+of\s+(?:make|brand)|(?:a\s+|any\s+)?(?:different|another)\s+make)\b/i;
const SCOPE_RESET_PATTERN = new RegExp(
  `${FULL_INVENTORY_RESET_PATTERN.source}|(?:not|without|except)\\s+(?:talking\\s+about\\s+)?(?:a\\s+)?[a-z][a-z-]*|no\\s+(?!more\\b|less\\b)(?:talking\\s+about\\s+)?(?:a\\s+)?[a-z][a-z-]*|forget\\s+(?:about\\s+)?[a-z][a-z-]*`,
  "i",
);
const PRESENTATION_PATTERN = /^(?:show\s+me|(?:show|browse|view)\s+(?:me\s+)?(?:them|those|the\s+(?:results|list|inventory)))\s*[.!?]*$/i;
const ORDINAL_REFERENCE_PATTERN = /\b(?:the\s+)?(first|second|third|last)\s+(?:one|vehicle|car|listing)\b/i;
const ORDINAL_ACTION_PATTERN = /\b(?:open|show|view|take\s+me\s+to)\s+(?:the\s+)?(?:first|second|third|last)\s+(?:one|vehicle|car|listing)\b/i;
const SELECTED_ACTION_PATTERN = /\b(?:open|show|view|take\s+me\s+to)\s+(?:it|this(?:\s+(?:one|vehicle|car))?|that(?:\s+(?:one|vehicle|car))?)\b/i;

export function emptyConversationInventoryState(): ConversationInventoryState {
  return { activeFilters: {}, resultSet: null, selectedVehicleId: null, turn: 0 };
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
  return { activeFilters, resultSet, selectedVehicleId, turn };
}

/** A new visitor turn only changes filters the visitor explicitly supplied. */
export function transitionInventoryState(
  current: ConversationInventoryState,
  userText: string,
  extractedFilters: VehicleQueryFilters,
  hasInventoryIntent: boolean,
): InventoryStateTransition {
  const nextTurn = current.turn + 1;
  const resetScope = hasScopeResetIntent(userText);
  const normalizedExtracted = pickFilters(extractedFilters);
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
  const clearsVehicleScope = switchesMake || clearsStrandedModel;
  const base = resetScope
    ? clearScopeFilters(current.activeFilters, userText)
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
    ...(!resetScope && clearsVehicleScope ? ["clear_model_on_make_change"] : []),
    ...(useStoredResultSet ? ["reuse_result_set"] : []),
    ...(ordinal ? ["ordinal_from_result_set"] : []),
    ...(selectedAction ? ["selected_vehicle_from_result_set"] : []),
  ];
  return {
    state: { ...current, activeFilters, turn: nextTurn },
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

export function ordinalResultSetVehicleId(
  userText: string,
  resultSet: ConversationResultSet | null,
): string | null {
  const match = ORDINAL_REFERENCE_PATTERN.exec(userText);
  if (!match || !resultSet || resultSet.orderedIds.length === 0) return null;
  const word = match[1]?.toLowerCase();
  // “Last” is unsafe when the query has more matches than the bounded
  // snapshot. Never silently substitute the last stored page item.
  if (word === "last" && resultSet.totalCount > resultSet.orderedIds.length) return null;
  const index = word === "first" ? 0 : word === "second" ? 1 : word === "third"
    ? 2
    : resultSet.orderedIds.length - 1;
  return resultSet.orderedIds[index] ?? null;
}

/** Navigation is only appropriate when the visitor explicitly asked to open it. */
export function isOrdinalVehicleActionRequest(userText: string): boolean {
  return ORDINAL_ACTION_PATTERN.test(userText);
}

export function isOrdinalVehicleReference(userText: string): boolean {
  return ORDINAL_REFERENCE_PATTERN.test(userText);
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
