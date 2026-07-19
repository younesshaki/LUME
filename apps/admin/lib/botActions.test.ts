import { describe, expect, it } from "vitest";
import {
  extractDeepseekTextDelta,
  extractInlineActions,
  InlineActionStreamFilter,
  isBotAction,
  parseBotActionLine,
  stripInlineActions,
  validateBotActionEnvelope,
} from "./botActions";

describe("extractDeepseekTextDelta", () => {
  it("pulls delta content from a data line", () => {
    const line = `data: {"choices":[{"delta":{"content":"Hi"}}]}`;
    expect(extractDeepseekTextDelta(line)).toBe("Hi");
  });

  it("ignores [DONE], non-data lines and malformed JSON", () => {
    expect(extractDeepseekTextDelta("data: [DONE]")).toBeUndefined();
    expect(extractDeepseekTextDelta("event: ping")).toBeUndefined();
    expect(extractDeepseekTextDelta("data: {nope")).toBeUndefined();
  });
});

describe("parseBotActionLine / isBotAction", () => {
  it("accepts each valid action shape", () => {
    const lines = [
      `{"type":"filter_inventory","make":"BMW","priceMax":50000}`,
      `{"type":"navigate","route":"/vehicles"}`,
      `{"type":"navigate-target","targetKey":"vehicle-detail","params":{"vehicleId":"v1"}}`,
      `{"type":"highlight-vehicle","vehicleId":"v1"}`,
      `{"type":"open-lead-form"}`,
      `{"type":"capture_lead","contact":{"email":"a@b.c"}}`,
      `{"type":"scroll-to","sectionId":"hero"}`,
    ];
    for (const line of lines) {
      expect(parseBotActionLine(line), line).toBeDefined();
    }
  });

  it("rejects unknown types, wrong field types and prose", () => {
    expect(parseBotActionLine(`{"type":"drop_tables"}`)).toBeUndefined();
    expect(parseBotActionLine(`{"type":"navigate","route":42}`)).toBeUndefined();
    expect(parseBotActionLine("Sure, here are your options:")).toBeUndefined();
    expect(parseBotActionLine(`{"type":"capture_lead","contact":{}}`)).toBeUndefined();
  });

  it("capture_lead requires email or phone", () => {
    expect(isBotAction({ type: "capture_lead", contact: { phone: "123" } })).toBe(true);
    expect(isBotAction({ type: "capture_lead", contact: { firstName: "A" } })).toBe(false);
  });
});

describe("extractInlineActions", () => {
  it("collects action lines interleaved with prose", () => {
    const content = [
      "Here are some SUVs under budget.",
      `{"type":"filter_inventory","bodyStyle":"SUV","priceMax":80000}`,
      "Want me to narrow it down?",
      `{"type":"scroll-to","sectionId":"inventory"}`,
    ].join("\n");
    const actions = extractInlineActions(content);
    expect(actions).toHaveLength(2);
    expect(actions[0]?.type).toBe("filter_inventory");
    expect(actions[1]?.type).toBe("scroll-to");
  });

  it("returns empty for pure prose", () => {
    expect(extractInlineActions("No actions here.")).toEqual([]);
  });
});

describe("stripInlineActions", () => {
  it("removes action lines without deleting arbitrary JSON", () => {
    const content = [
      "Absolutely — taking you there now.",
      `{"type":"highlight-vehicle","vehicleId":"v1"}`,
      `{"answer":"ordinary JSON"}`,
      "Let me know if you want a comparison.",
    ].join("\n");
    expect(stripInlineActions(content)).toBe(
      [
        "Absolutely — taking you there now.",
        `{"answer":"ordinary JSON"}`,
        "Let me know if you want a comparison.",
      ].join("\n"),
    );
  });

  it("removes a valid action embedded after prose while keeping that prose", () => {
    const action = `{"type":"navigate-target","targetKey":"inventory"}`;
    const content = `I’ll open the live inventory now. ${action} You can refine it there.`;
    expect(extractInlineActions(content)).toEqual([
      { type: "navigate-target", targetKey: "inventory" },
    ]);
    expect(stripInlineActions(content)).toBe(
      "I’ll open the live inventory now.  You can refine it there.",
    );
  });

  it("preserves intentional paragraph breaks around action-free prose", () => {
    expect(stripInlineActions("First paragraph.\n\nSecond paragraph.")).toBe(
      "First paragraph.\n\nSecond paragraph.",
    );
    const filter = new InlineActionStreamFilter();
    expect(filter.push("First paragraph.\n\nSecond paragraph.\n")).toEqual({
      visibleText: "First paragraph.\n\nSecond paragraph.\n",
      actions: [],
    });
  });
});

describe("InlineActionStreamFilter", () => {
  it("passes prose promptly while suppressing an action split across deltas", () => {
    const filter = new InlineActionStreamFilter();
    expect(filter.push("Taking you there.\n{\"type\":\"navigate-tar")).toEqual({
      visibleText: "Taking you there.\n",
      actions: [],
    });
    expect(
      filter.push("get\",\"targetKey\":\"vehicle-detail\",\"params\":{\"vehicleId\":\"v1\"}}\nNext"),
    ).toEqual({
      visibleText: "Next",
      actions: [
        {
          type: "navigate-target",
          targetKey: "vehicle-detail",
          params: { vehicleId: "v1" },
        },
      ],
    });
    expect(filter.flush()).toEqual({ visibleText: "", actions: [] });
  });

  it("keeps malformed or ordinary JSON visible", () => {
    const filter = new InlineActionStreamFilter();
    expect(filter.push(`{"type":"invented"}\n`)).toEqual({
      visibleText: `{"type":"invented"}\n`,
      actions: [],
    });
    expect(filter.push(`{"answer":"still prose"}`)).toEqual({
      visibleText: "",
      actions: [],
    });
    expect(filter.flush()).toEqual({
      visibleText: `{"answer":"still prose"}`,
      actions: [],
    });
  });

  it("suppresses an embedded action split across deltas without delaying prose", () => {
    const filter = new InlineActionStreamFilter();
    expect(filter.push("Opening it now: {\"type\":\"navigate-")).toEqual({
      visibleText: "Opening it now: ",
      actions: [],
    });
    expect(filter.push("target\",\"targetKey\":\"inventory\"} Done.\n")).toEqual({
      visibleText: " Done.\n",
      actions: [{ type: "navigate-target", targetKey: "inventory" }],
    });
    expect(filter.flush()).toEqual({ visibleText: "", actions: [] });
  });
});

describe("validateBotActionEnvelope", () => {
  it("accepts a valid action and strips unrelated envelope fields", () => {
    expect(
      validateBotActionEnvelope({
        action: { type: "navigate", route: "/vehicles" },
        tenantId: "untrusted-client-value",
      })
    ).toEqual({
      ok: true,
      value: { action: { type: "navigate", route: "/vehicles" } },
    });
  });

  it("rejects malformed envelopes and actions", () => {
    expect(validateBotActionEnvelope(null)).toEqual({
      ok: false,
      error: "Request body must be an object.",
    });
    expect(validateBotActionEnvelope({ action: { type: "navigate", route: 42 } })).toEqual({
      ok: false,
      error: "Action is missing or invalid.",
    });
  });
});
