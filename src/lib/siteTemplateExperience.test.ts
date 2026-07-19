import { describe, expect, it } from "vitest";
import type { SiteTemplateAction } from "@lume/types";
import {
  prefixTemplateLeadMessage,
  resolveTemplateAction,
} from "./siteTemplateExperience";

describe("website template conversion actions", () => {
  it("maps every registry action to a finite public behavior", () => {
    const actions: SiteTemplateAction[] = [
      "browse-inventory",
      "explore-financing",
      "book-test-drive",
      "book-appointment",
      "value-trade",
    ];

    expect(actions.map(resolveTemplateAction)).toMatchObject([
      { kind: "navigate", route: "vehicles" },
      { kind: "lead", intent: "financing", source: "contact-form" },
      { kind: "lead", intent: "test-drive", source: "test-drive" },
      { kind: "lead", intent: "appointment", source: "contact-form" },
      { kind: "lead", intent: "trade-in", source: "contact-form" },
    ]);
  });

  it("adds trusted intent context without losing visitor details", () => {
    const behavior = resolveTemplateAction("value-trade");
    expect(behavior.kind).toBe("lead");
    if (behavior.kind !== "lead") return;
    expect(prefixTemplateLeadMessage(behavior, "2021 Volvo, 42,000 miles")).toBe(
      "[Website trade-in request]\n2021 Volvo, 42,000 miles",
    );
    expect(prefixTemplateLeadMessage(behavior, "   ")).toBe(
      "[Website trade-in request]",
    );
  });
});
