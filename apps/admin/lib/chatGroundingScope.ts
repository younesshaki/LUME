import type { VehicleQueryFilters } from "@lume/rag";

/**
 * Whether the vehicle the visitor last opened still belongs in the model's
 * context for this turn.
 *
 * Background. Once a visitor lands on a vehicle page, `body.pagePath` keeps
 * pointing there for the rest of the session, so a selected vehicle resolves on
 * every later turn. The route then unshifts a full description of that one car
 * to the front of the context block at the highest score — telling the model
 * "this is what the visitor is looking at" on a turn where they asked about the
 * whole inventory. The GROUNDING RULE in the system prompt then faithfully
 * keeps the model anchored to it. The prompt is not the bug; the context is.
 *
 * The chunk exists to serve a real case and must keep serving it: "tell me more
 * about it", "is it AWD?", "how many miles?" — including before navigation has
 * settled `pagePath`. Those are detail requests, ordinal references and
 * selected-vehicle actions, and all of them keep the grounding.
 *
 * What is dropped is narrower: a turn that is plainly a *new inventory search*,
 * naming a dimension the active scope does not already have. Asking for SUVs
 * after opening a BMW is a new search, not a question about the BMW.
 */

/** Dimensions that identify *which vehicles* a visitor is asking about. */
const SCOPE_DIMENSIONS = ["make", "model", "bodyStyle"] as const;

export type GroundingScopeInput = {
  /** The turn reads as an inventory query at all. */
  hasInventoryIntent: boolean;
  /** Filters parsed from this turn's message. */
  extractedFilters: VehicleQueryFilters;
  /** Filters already in force before this turn. */
  activeFilters: VehicleQueryFilters;
  /** "tell me more about it", "is it AWD?" — about the selected vehicle. */
  isSelectedVehicleDetailRequest: boolean;
  /** "the second one" — resolves against the stored result set. */
  isOrdinalReference: boolean;
  /** "take me to it", "save it" — acts on the selected vehicle. */
  isSelectedVehicleAction: boolean;
};

/**
 * True when this turn introduces a make, model or body style that is not
 * already part of the active scope.
 *
 * Only these three count. Price and mileage narrow a search without changing
 * its subject — "under $30k" after opening a BMW is plausibly still about
 * BMWs, and treating it as a fresh search would drop grounding the visitor
 * still wants.
 */
export function introducesNewScopeDimension(
  extractedFilters: VehicleQueryFilters,
  activeFilters: VehicleQueryFilters,
): boolean {
  return SCOPE_DIMENSIONS.some((dimension) => {
    const extracted = extractedFilters[dimension];
    return extracted !== undefined && extracted !== activeFilters[dimension];
  });
}

export function shouldGroundSelectedVehicle(input: GroundingScopeInput): boolean {
  // Anything explicitly about the selected vehicle keeps its grounding, whatever
  // else the turn looks like. This is the case the chunk exists for.
  if (
    input.isSelectedVehicleDetailRequest ||
    input.isOrdinalReference ||
    input.isSelectedVehicleAction
  ) {
    return true;
  }
  // A fresh search that names a new subject is not about the open vehicle.
  if (input.hasInventoryIntent && introducesNewScopeDimension(input.extractedFilters, input.activeFilters)) {
    return false;
  }
  return true;
}
