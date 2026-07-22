import { describe, expect, it } from "vitest";
import type { Vehicle } from "@lume/types";
import {
  emptyConversationInventoryState,
  filterActionsByConversationState,
  filterActionsByConversationStateWithDiagnostics,
  isAmbiguousAffirmation,
  isOrdinalVehicleActionRequest,
  isOrdinalVehicleReference,
  isPresentationRequest,
  isSelectedVehicleActionRequest,
  isSelectedVehicleDetailRequest,
  isTruncatedLastOrdinalReference,
  isUnsupportedVehicleFactRequest,
  ordinalResultSetVehicleId,
  preserveResultSetForZeroResults,
  selectConversationVehicle,
  selectedResultSetVehicleId,
  setConversationResultSet,
  transitionInventoryState,
  vehicleSatisfiesActiveFilters,
} from "./chatConversationState";

const FIRST = "11111111-1111-4111-8111-111111111111";
const SECOND = "22222222-2222-4222-8222-222222222222";

const vehicle = (id: string, price = 9_500): Vehicle => ({
  id,
  tenantId: "tenant-demo",
  stockType: "Used",
  year: 2026,
  make: "Toyota",
  model: "Camry",
  trim: "SE",
  price,
  mileage: 10_000,
  bodyStyle: "Sedan",
  exteriorColor: "Black",
  interiorColor: "Black",
  drivetrain: "FWD",
  fuelType: "Hybrid",
  imageSrc: "",
  sellerCity: "Seattle",
  sellerState: "WA",
  isSpecial: false,
  status: "live",
  soldAt: null,
  soldPrice: null,
});

describe("chat conversation inventory state", () => {
  it("keeps a verified scope for the exact 'show me' continuation", () => {
    const state = setConversationResultSet({
      ...emptyConversationInventoryState(),
      activeFilters: { make: "Toyota", model: "Camry", year: 2026 },
      turn: 1,
    }, [vehicle(FIRST), vehicle(SECOND)], 9);
    const transition = transitionInventoryState(state, "show me", {}, true);
    expect(transition.shouldQuery).toBe(false);
    expect(transition.useStoredResultSet).toBe(true);
    expect(transition.state.activeFilters).toEqual(state.activeFilters);
    expect(isPresentationRequest("show me")).toBe(true);
  });

  it("clears stale make/model scope for all-inventory reset language", () => {
    const transition = transitionInventoryState({
      ...emptyConversationInventoryState(),
      activeFilters: { make: "Toyota", model: "Camry", year: 2026 },
    }, "No, all inventory under $10,000 — not Toyota specifically", { priceMax: 10_000 }, true);
    expect(transition.state.activeFilters).toEqual({ priceMax: 10_000 });
    expect(transition.rules).toContain("clear_make_model_scope");
  });

  it("replaces a negated make with the visitor's newly named make", () => {
    const transition = transitionInventoryState({
      ...emptyConversationInventoryState(),
      activeFilters: { make: "Toyota", model: "Camry", priceMax: 70_000 },
    }, "not Toyota — show me BMWs instead", { make: "BMW" }, true);
    expect(transition.state.activeFilters).toEqual({ priceMax: 70_000, make: "BMW" });
  });

  it("drops a stranded model when a new make is named ('camry' -> 'caddy')", () => {
    const transition = transitionInventoryState({
      ...emptyConversationInventoryState(),
      activeFilters: { model: "Camry" },
    }, "what about a caddy?", { make: "Cadillac" }, true);
    expect(transition.state.activeFilters).toEqual({ make: "Cadillac" });
    expect(transition.rules).toContain("clear_model_on_make_change");
  });

  it("clears the prior model when switching makes but keeps make-agnostic facets", () => {
    const transition = transitionInventoryState({
      ...emptyConversationInventoryState(),
      activeFilters: { make: "BMW", model: "X5", bodyStyle: "SUV", priceMax: 70_000 },
    }, "what about Mercedes?", { make: "Mercedes-Benz" }, true);
    expect(transition.state.activeFilters).toEqual({
      make: "Mercedes-Benz", bodyStyle: "SUV", priceMax: 70_000,
    });
  });

  it("clears a stranded model YEAR on a make switch (reproduces the 2026-07-22 live failure)", () => {
    // "do you have a 2026 Camry?" -> ... -> "BMW SUVs under 70k" three turns
    // later must not silently stay pinned to year:2026 — that previously
    // forced a real BMW match to a false zero-result.
    const transition = transitionInventoryState({
      ...emptyConversationInventoryState(),
      activeFilters: { make: "Toyota", model: "Camry", year: 2026 },
    }, "BMW SUVs under 70k", { make: "BMW", bodyStyle: "SUV", priceMax: 70_000 }, true);
    expect(transition.state.activeFilters).toEqual({
      make: "BMW", bodyStyle: "SUV", priceMax: 70_000,
    });
    expect(transition.state.activeFilters.year).toBeUndefined();
  });

  it("clears a yearMin/yearMax range on a make switch, same as an exact year", () => {
    const transition = transitionInventoryState({
      ...emptyConversationInventoryState(),
      activeFilters: { make: "Toyota", yearMin: 2024, yearMax: 2026 },
    }, "what about Honda", { make: "Honda" }, true);
    expect(transition.state.activeFilters).toEqual({ make: "Honda" });
  });

  it("keeps model year when the visitor stays on the same make", () => {
    const transition = transitionInventoryState({
      ...emptyConversationInventoryState(),
      activeFilters: { make: "Toyota", model: "Camry", year: 2026 },
    }, "under 40k", { priceMax: 40_000 }, true);
    expect(transition.state.activeFilters).toEqual({
      make: "Toyota", model: "Camry", year: 2026, priceMax: 40_000,
    });
  });

  it("resolves ordinals from stored order without a re-query", () => {
    const state = setConversationResultSet(emptyConversationInventoryState(), [vehicle(FIRST), vehicle(SECOND)], 2);
    const transition = transitionInventoryState(state, "open the second one", {}, true);
    expect(transition.shouldQuery).toBe(false);
    expect(ordinalResultSetVehicleId("open the second one", state.resultSet)).toBe(SECOND);
    expect(selectConversationVehicle(state, SECOND).selectedVehicleId).toBe(SECOND);
  });

  it("grounds natural ordinal references without treating them as navigation", () => {
    const state = setConversationResultSet(emptyConversationInventoryState(), [vehicle(FIRST), vehicle(SECOND)], 2);
    const transition = transitionInventoryState(state, "what was the second one?", {}, true);
    expect(transition.shouldQuery).toBe(false);
    expect(ordinalResultSetVehicleId("what was the second one?", state.resultSet)).toBe(SECOND);
    expect(isOrdinalVehicleReference("what was the second one?")).toBe(true);
    expect(isOrdinalVehicleActionRequest("what was the second one?")).toBe(false);
    expect(isOrdinalVehicleActionRequest("open the second one")).toBe(true);
  });

  it("refuses a last-result reference when the snapshot is truncated", () => {
    const state = setConversationResultSet(
      emptyConversationInventoryState(),
      [vehicle(FIRST), vehicle(SECOND)],
      35,
    );
    expect(ordinalResultSetVehicleId("open the last one", state.resultSet)).toBeNull();
    expect(isTruncatedLastOrdinalReference("open the last one", state.resultSet)).toBe(true);
    expect(ordinalResultSetVehicleId("open the third one", state.resultSet)).toBeNull();
  });

  it("resolves 'open it' only from the selected current result", () => {
    const state = selectConversationVehicle(
      setConversationResultSet(emptyConversationInventoryState(), [vehicle(FIRST), vehicle(SECOND)], 2),
      SECOND,
    );
    const transition = transitionInventoryState(state, "open it", {}, true);
    expect(transition.shouldQuery).toBe(false);
    expect(transition.rules).toContain("selected_vehicle_from_result_set");
    expect(isSelectedVehicleActionRequest("open it")).toBe(true);
    expect(selectedResultSetVehicleId("open it", state)).toBe(SECOND);
    expect(selectedResultSetVehicleId("open it", emptyConversationInventoryState())).toBeNull();
  });

  it("rejects vehicle actions outside the current result set", () => {
    const state = setConversationResultSet(emptyConversationInventoryState(), [vehicle(FIRST)], 1);
    expect(filterActionsByConversationState([
      { type: "navigate-target", targetKey: "vehicle-detail", params: { vehicleId: FIRST } },
      { type: "navigate-target", targetKey: "vehicle-detail", params: { vehicleId: SECOND } },
    ], state)).toEqual([
      { type: "navigate-target", targetKey: "vehicle-detail", params: { vehicleId: FIRST } },
    ]);
  });

  it("enforces the active price cap before a vehicle can be selected", () => {
    expect(vehicleSatisfiesActiveFilters(vehicle(FIRST, 9_500), { priceMax: 10_000 })).toBe(true);
    expect(vehicleSatisfiesActiveFilters(vehicle(SECOND, 26_000), { priceMax: 10_000 })).toBe(false);
  });

  it("drops stale-snapshot actions after a zero-result price refinement", () => {
    const initial = setConversationResultSet({
      ...emptyConversationInventoryState(),
      activeFilters: { make: "Toyota", model: "Camry" },
    }, [vehicle(FIRST, 26_000)], 1);
    const refined = {
      ...initial,
      activeFilters: { make: "Toyota", model: "Camry", priceMax: 10_000 },
    };
    const action = {
      type: "navigate-target" as const,
      targetKey: "vehicle-detail",
      params: { vehicleId: FIRST },
    };

    expect(filterActionsByConversationState([action], refined)).toEqual([]);
    expect(filterActionsByConversationStateWithDiagnostics([action], refined).dropped).toEqual([
      { type: "navigate-target", vehicleId: FIRST, rule: "stale_result_set_filters" },
    ]);
    // The route may pass a vehicle only after it has rechecked it against the
    // active filters (the ordinal path does exactly that).
    expect(filterActionsByConversationState([action], refined, [FIRST])).toEqual([action]);
  });

  it("does not guess which of two offered options a bare affirmation selects", () => {
    expect(isAmbiguousAffirmation(
      "yes",
      "Would you like all inventory under $10k, or older Camrys?",
    )).toBe(true);
    expect(isAmbiguousAffirmation("yes", "Would you like to see the Camry?")).toBe(false);
  });

  it("recognizes factual details about the selected vehicle without broadening search", () => {
    expect(isSelectedVehicleDetailRequest("tell me more about it")).toBe(true);
    expect(isSelectedVehicleDetailRequest("how much is this one?")).toBe(true);
    expect(isSelectedVehicleDetailRequest("is it AWD?")).toBe(true);
    expect(isSelectedVehicleDetailRequest("does it have AWD?")).toBe(true);
    expect(isSelectedVehicleDetailRequest("how many miles does it have?")).toBe(true);
    expect(isSelectedVehicleDetailRequest("tell me more about Ferraris")).toBe(false);
  });

  it("recognizes high-stakes facts that must not be inferred from inventory prose", () => {
    expect(isUnsupportedVehicleFactRequest("does it have heated seats?")).toBe(true);
    expect(isUnsupportedVehicleFactRequest("are BMWs reliable?")).toBe(true);
    expect(isUnsupportedVehicleFactRequest("does it have a clean history?")).toBe(true);
    expect(isUnsupportedVehicleFactRequest("show me AWD sedans")).toBe(false);
  });

  it("covers the reported Camry → budget → all-inventory → ordinal transcript", () => {
    let state = transitionInventoryState(
      emptyConversationInventoryState(),
      "you have a 2026 camry?",
      { model: "Camry", year: 2026 },
      true,
    ).state;
    state = setConversationResultSet(state, [vehicle(FIRST), vehicle(SECOND)], 9);

    const show = transitionInventoryState(state, "show me", {}, true);
    expect(show.shouldQuery).toBe(false);
    expect(show.useStoredResultSet).toBe(true);

    const budget = transitionInventoryState(show.state, "I got a 10k budget", { priceMax: 10_000 }, true);
    expect(budget.state.activeFilters).toMatchObject({ model: "Camry", priceMax: 10_000 });

    const allInventory = transitionInventoryState(
      budget.state,
      "I'm not talking about Toyota, I'm talking in general. All inventory under 10k.",
      { priceMax: 10_000 },
      true,
    );
    expect(allInventory.state.activeFilters).toEqual({ priceMax: 10_000 });

    const emptyRefinement = { ...allInventory.state, resultSet: state.resultSet };
    expect(preserveResultSetForZeroResults(emptyRefinement).resultSet).toEqual(state.resultSet);
    expect(ordinalResultSetVehicleId("open the second one", emptyRefinement.resultSet)).toBe(SECOND);
    expect(vehicleSatisfiesActiveFilters(vehicle(SECOND, 26_000), allInventory.state.activeFilters)).toBe(false);
  });
});
