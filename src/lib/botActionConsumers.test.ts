import { beforeEach, describe, expect, it } from "vitest";
import { readVehicleUrlState } from "@/experience/vehicles/urlState";
import {
  consumePendingLeadFormPrefill,
  consumePendingLeadFormSourceContext,
  consumePendingVehicleComparison,
  leadFormPrefillFromAction,
  resolveBotNavigationRoute,
  storePendingLeadFormPrefill,
  storePendingVehicleComparison,
  vehicleFiltersFromBotAction,
  vehicleRouteFromBotAction,
} from "./botActionConsumers";

describe("bot action consumers", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/home");
  });

  it("maps safe public bot routes", () => {
    expect(resolveBotNavigationRoute("vehicles")).toEqual({ route: "vehicles" });
    expect(resolveBotNavigationRoute("/contact?source=chat")).toEqual({ route: "contact" });
    expect(resolveBotNavigationRoute("https://example.com/showcase/intro")).toEqual({
      route: "showcase",
    });
    expect(resolveBotNavigationRoute("/admin")).toBeNull();
  });

  it("resolves vehicle and product detail paths while preserving identifier case", () => {
    expect(resolveBotNavigationRoute("/vehicles/ABC-123")).toEqual({
      route: "vehicleDetail",
      vehicleId: "ABC-123",
    });
    expect(resolveBotNavigationRoute("/products/Red-Bull?ref=chat")).toEqual({
      route: "productDetail",
      productId: "Red-Bull",
    });
    expect(resolveBotNavigationRoute("/vehicles/one/extra")).toBeNull();
    expect(resolveBotNavigationRoute("/vehicles/%E0%A4%A")).toBeNull();
  });

  it("normalizes coarse vehicle filters", () => {
    expect(
      vehicleFiltersFromBotAction({
        type: "filter_inventory",
        make: " Ferrari ",
        bodyStyle: " Coupe ",
        priceMin: 19999.4,
        priceMax: -20,
      })
    ).toMatchObject({
      query: "",
      make: "Ferrari",
      bodyStyle: "Coupe",
      priceMin: 19999,
      priceMax: 0,
    });
  });

  it("preserves every grounded concierge filter in public inventory state", () => {
    expect(
      vehicleFiltersFromBotAction({
        type: "filter_inventory",
        make: "BMW",
        model: "X3",
        stockType: "Used",
        fuelType: "Gasoline",
        drivetrain: "AWD",
        sellerState: "FL",
        sellerCity: "Miami",
        yearMin: 2020,
        yearMax: 2020,
        mileageMax: 50_000,
        priceMin: 40_000,
        priceMax: 70_000,
      }),
    ).toMatchObject({
      make: "BMW",
      model: "X3",
      stockType: "Used",
      fuelType: "Gasoline",
      drivetrain: "AWD",
      sellerState: "FL",
      sellerCity: "Miami",
      yearMin: 2020,
      yearMax: 2020,
      mileageMax: 50_000,
      priceMin: 40_000,
      priceMax: 70_000,
    });
  });

  it("carries inventory filters in the destination URL state", () => {
    const route = vehicleRouteFromBotAction({
      type: "filter_inventory",
      make: "BMW",
      priceMax: 50_000,
    });
    expect(route).toEqual({
      route: "vehicles",
      inventoryState: "#vehicles?make=BMW&priceMax=50000",
    });

    window.history.replaceState({}, "", `/vehicles${route.inventoryState}`);
    // The loading fallback and published VehicleInventory block can both read
    // the handoff without the first renderer consuming it.
    expect(readVehicleUrlState().filters).toMatchObject({
      make: "BMW",
      priceMax: 50_000,
    });
    expect(readVehicleUrlState().filters).toMatchObject({
      make: "BMW",
      priceMax: 50_000,
    });
  });

  it("carries an explicit concierge sort into public inventory state", () => {
    const route = vehicleRouteFromBotAction({
      type: "filter_inventory",
      make: "BMW",
      sort: "price_asc",
    });
    expect(route.inventoryState).toContain("sort=price_asc");
  });

  it("carries a grounded comparison through navigation exactly once", () => {
    storePendingVehicleComparison({
      type: "compare_vehicles",
      vehicleIds: ["vehicle-a", "vehicle-b", "vehicle-a", "vehicle-c"],
    });
    expect(consumePendingVehicleComparison()).toEqual([
      "vehicle-a",
      "vehicle-b",
      "vehicle-c",
    ]);
    expect(consumePendingVehicleComparison()).toBeNull();
  });

  it("drops unsupported lead prefill keys and stores the result once", () => {
    const action = {
      type: "open-lead-form" as const,
      prefill: {
        firstName: " Ada ",
        email: "ada@example.com",
        ignored: "nope",
        phone: 123,
      },
    };

    expect(leadFormPrefillFromAction(action)).toEqual({
      firstName: "Ada",
      email: "ada@example.com",
    });

    storePendingLeadFormPrefill({
      ...action,
      vehicleId: "v1",
      attribution: {
        targetKey: "contact-lead-form",
        sessionId: "chat-1",
        conversationContext: "user: Please contact me",
      },
    });
    expect(consumePendingLeadFormPrefill()).toEqual({
      firstName: "Ada",
      email: "ada@example.com",
    });
    expect(consumePendingLeadFormPrefill()).toBeNull();
    expect(consumePendingLeadFormSourceContext()).toEqual({
      trigger: "bot-action",
      actionType: "open-lead-form",
      vehicleId: "v1",
      targetKey: "contact-lead-form",
      chatSessionId: "chat-1",
      conversationContext: "user: Please contact me",
    });
    expect(consumePendingLeadFormSourceContext()).toBeNull();
  });

  it("stores open lead-form actions even without prefill", () => {
    storePendingLeadFormPrefill({ type: "open-lead-form" });

    expect(consumePendingLeadFormPrefill()).toEqual({});
    expect(consumePendingLeadFormPrefill()).toBeNull();
    expect(consumePendingLeadFormSourceContext()).toEqual({
      trigger: "bot-action",
      actionType: "open-lead-form",
    });
  });
});
