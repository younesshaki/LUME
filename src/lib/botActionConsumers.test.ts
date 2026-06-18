import { beforeEach, describe, expect, it } from "vitest";
import {
  consumePendingInventoryFilter,
  consumePendingLeadFormPrefill,
  leadFormPrefillFromAction,
  resolveBotNavigationRoute,
  storePendingInventoryFilter,
  storePendingLeadFormPrefill,
  vehicleFiltersFromBotAction,
} from "./botActionConsumers";

describe("bot action consumers", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("maps safe public bot routes", () => {
    expect(resolveBotNavigationRoute("vehicles")).toEqual({ route: "vehicles" });
    expect(resolveBotNavigationRoute("/contact?source=chat")).toEqual({ route: "contact" });
    expect(resolveBotNavigationRoute("https://example.com/showcase/intro")).toEqual({
      route: "showcase",
    });
    expect(resolveBotNavigationRoute("/admin")).toBeNull();
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

  it("stores pending inventory filters once", () => {
    storePendingInventoryFilter({
      type: "filter_inventory",
      make: "BMW",
      priceMax: 100000,
    });

    expect(consumePendingInventoryFilter()).toMatchObject({
      make: "BMW",
      priceMax: 100000,
    });
    expect(consumePendingInventoryFilter()).toBeNull();
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

    storePendingLeadFormPrefill(action);
    expect(consumePendingLeadFormPrefill()).toEqual({
      firstName: "Ada",
      email: "ada@example.com",
    });
    expect(consumePendingLeadFormPrefill()).toBeNull();
  });

  it("stores open lead-form actions even without prefill", () => {
    storePendingLeadFormPrefill({ type: "open-lead-form" });

    expect(consumePendingLeadFormPrefill()).toEqual({});
    expect(consumePendingLeadFormPrefill()).toBeNull();
  });
});
