import { beforeEach, describe, expect, it } from "vitest";
import {
  consumePendingInventoryFilter,
  consumePendingLeadFormPrefill,
  consumePendingLeadFormSourceContext,
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
