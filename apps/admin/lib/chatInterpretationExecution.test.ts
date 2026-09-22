import { describe, expect, it } from "vitest";
import type { ChatInterpretation } from "./chatInterpretation";
import {
  compileChatInterpretation,
  isContextualInterpretationEnabled,
} from "./chatInterpretationExecution";

const plan = (over: Partial<ChatInterpretation>): ChatInterpretation => ({
  version: 1,
  kind: "search",
  setFilters: {},
  clearFilters: [],
  reference: null,
  clarifyReason: null,
  unsupportedClauses: [],
  ...over,
});

describe("contextual interpretation compiler", () => {
  it("routes searches and refinements through deterministic inventory inputs", () => {
    expect(
      compileChatInterpretation(
        plan({ kind: "search", setFilters: { make: "BMW", priceMax: 50000 } }),
        "something Bavarian around fifty grand",
      ),
    ).toMatchObject({
      userText: "start over with inventory",
      filters: { make: "BMW", priceMax: 50000 },
      clearFilters: [],
      hasInventoryIntent: true,
    });
    expect(
      compileChatInterpretation(
        plan({ kind: "refine", setFilters: { drivetrain: "AWD" } }),
        "only the ones that drive all four wheels",
      ),
    ).toMatchObject({
      userText: "only the ones that drive all four wheels",
      filters: { drivetrain: "AWD" },
    });
  });

  it("preserves explicit semantic filter clears for the state machine", () => {
    expect(
      compileChatInterpretation(
        plan({ kind: "refine", clearFilters: ["make", "model"] }),
        "any brand is fine now",
      ),
    ).toMatchObject({ clearFilters: ["make", "model"] });
  });

  it("compiles resets and presentation without carrying stale filters", () => {
    expect(
      compileChatInterpretation(plan({ kind: "reset" }), "wipe it clean"),
    ).toMatchObject({ userText: "show me all inventory", filters: {} });
    expect(
      compileChatInterpretation(plan({ kind: "present" }), "put those up"),
    ).toMatchObject({ userText: "show me", filters: {} });
  });

  it("keeps navigation explicit and resolves non-action references without inventing an action", () => {
    const reference = { kind: "ordinal" as const, position: 3 };
    expect(
      compileChatInterpretation(
        plan({ kind: "reference", reference }),
        "could you pull up item number three",
      )?.userText,
    ).toBe("open the 3rd one");
    expect(
      compileChatInterpretation(
        plan({ kind: "reference", reference }),
        "what about item number three",
      )?.userText,
    ).toBe("the 3rd one");
  });

  it("builds bounded server-authored clarification copy", () => {
    const compiled = compileChatInterpretation(
      plan({ kind: "clarify", clarifyReason: "relative_constraint" }),
      "anything cheaper",
    );
    expect(compiled?.clarification).toContain("exact limit");
  });

  it("never partially executes mixed or unsupported requests", () => {
    expect(
      compileChatInterpretation(
        plan({
          kind: "search",
          setFilters: { make: "BMW" },
          unsupportedClauses: ["book a test drive"],
        }),
        "BMWs and book a test drive",
      ),
    ).toBeNull();
    expect(
      compileChatInterpretation(plan({ kind: "lead_form" }), "book it"),
    ).toBeNull();
  });
});

describe("contextual interpretation rollout gates", () => {
  it("refuses active rollout until a model passes the versioned evidence gate", () => {
    expect(
      isContextualInterpretationEnabled(
        "demo",
        "kimi-k2.6",
        "true",
        "default, demo",
      ),
    ).toBe(false);
  });

  it("requires both runtime gates and exact tenant membership after certification", () => {
    const certified = ["kimi-k2.6"];
    expect(
      isContextualInterpretationEnabled(
        "demo",
        "kimi-k2.6",
        undefined,
        "demo",
        certified,
      ),
    ).toBe(false);
    expect(
      isContextualInterpretationEnabled(
        "demo",
        "kimi-k2.6",
        "true",
        "default",
        certified,
      ),
    ).toBe(false);
    expect(
      isContextualInterpretationEnabled(
        "DEMO",
        "kimi-k2.6",
        "TRUE",
        "default, demo",
        certified,
      ),
    ).toBe(true);
  });
});
