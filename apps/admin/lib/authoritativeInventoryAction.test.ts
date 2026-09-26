import { describe, expect, it } from "vitest";
import type { BotAction, BotInventoryFilterAction } from "@lume/types";
import { withAuthoritativeInventoryAction } from "./authoritativeInventoryAction";

const chevroletAwd: BotInventoryFilterAction = {
  type: "filter_inventory",
  make: "Chevrolet",
  drivetrain: "AWD",
};

describe("withAuthoritativeInventoryAction", () => {
  it("leaves ordinary model actions unchanged when no inventory query was verified", () => {
    const actions: BotAction[] = [
      { type: "navigate-target", targetKey: "inventory" },
    ];

    expect(withAuthoritativeInventoryAction(actions, null)).toEqual(actions);
  });

  it("prepends the server-verified filter action while retaining unrelated actions", () => {
    const actions: BotAction[] = [
      { type: "navigate-target", targetKey: "inventory" },
    ];

    expect(withAuthoritativeInventoryAction(actions, chevroletAwd)).toEqual([
      chevroletAwd,
      ...actions,
    ]);
  });

  it("replaces a model-authored inventory filter so UI state cannot disagree with chat state", () => {
    const modelFilter: BotInventoryFilterAction = {
      type: "filter_inventory",
      make: "Porsche",
    };
    const actions: BotAction[] = [
      modelFilter,
      { type: "open-lead-form" },
    ];

    expect(withAuthoritativeInventoryAction(actions, chevroletAwd)).toEqual([
      chevroletAwd,
      { type: "open-lead-form" },
    ]);
  });
});
