import { describe, expect, it } from "vitest";
import {
  CHAT_INTERPRETATION_SCHEMA_VERSION,
  buildInterpretationSchemaPrompt,
  parseChatInterpretation,
} from "./chatInterpretation";
import {
  CHAT_INTERPRETATION_GOLD_SET,
  CHAT_INTERPRETATION_GOLD_SET_VERSION,
  goldSetDenominators,
} from "./chatInterpretationGoldSet";
import {
  buildInterpreterContext,
  buildInterpreterContextPrompt,
  compareShadowInterpretation,
  isShadowInterpretationEnabled,
} from "./chatInterpretationShadow";
import { emptyConversationInventoryState } from "./chatConversationState";

const plan = (over: Record<string, unknown> = {}) => {
  const kind = typeof over.kind === "string" ? over.kind : "search";
  return JSON.stringify({
    version: CHAT_INTERPRETATION_SCHEMA_VERSION,
    kind,
    setFilters:
      "setFilters" in over
        ? over.setFilters
        : kind === "search"
          ? { make: "BMW" }
          : {},
    ...over,
  });
};

describe("interpretation schema: what it accepts", () => {
  it("accepts a well-formed search", () => {
    expect(parseChatInterpretation(plan())).toMatchObject({
      kind: "search",
      setFilters: { make: "BMW" },
      clearFilters: [],
      reference: null,
      unsupportedClauses: [],
    });
  });

  it("accepts a fenced reply, because models fence JSON", () => {
    expect(
      parseChatInterpretation("```json\n" + plan() + "\n```"),
    ).not.toBeNull();
  });

  it("keeps clauses it cannot express instead of dropping them", () => {
    // Silently discarding half a request is how "BMWs and book a test drive"
    // becomes a plain BMW search with nobody the wiser.
    const parsed = parseChatInterpretation(
      plan({ unsupportedClauses: ["book a test drive for Saturday"] }),
    );
    expect(parsed?.unsupportedClauses).toEqual([
      "book a test drive for Saturday",
    ]);
  });

  it("accepts an ordinal reference within range", () => {
    const parsed = parseChatInterpretation(
      plan({
        kind: "reference",
        setFilters: {},
        reference: { kind: "ordinal", position: 3 },
      }),
    );
    expect(parsed?.reference).toEqual({ kind: "ordinal", position: 3 });
  });

  it("accepts a comparison of two positions", () => {
    const parsed = parseChatInterpretation(
      plan({
        kind: "reference",
        setFilters: {},
        reference: { kind: "compare", positions: [1, 2] },
      }),
    );
    expect(parsed?.reference).toEqual({ kind: "compare", positions: [1, 2] });
  });
});

describe("interpretation schema: what it refuses", () => {
  it("refuses a plan from a different schema version", () => {
    // A version bump exists precisely because an older build cannot know what
    // a newer field means.
    expect(parseChatInterpretation(plan({ version: 99 }))).toBeNull();
  });

  it("refuses an unknown intent kind", () => {
    expect(
      parseChatInterpretation(plan({ kind: "delete_everything" })),
    ).toBeNull();
  });

  it("refuses an unknown filter field rather than skipping it", () => {
    // Skipping would mean accepting a plan written against a schema this
    // build does not implement, and acting on the part we happened to share.
    expect(
      parseChatInterpretation(
        plan({ setFilters: { make: "BMW", vin: "XYZ" } }),
      ),
    ).toBeNull();
  });

  it("refuses a filter with the wrong type", () => {
    expect(
      parseChatInterpretation(plan({ setFilters: { priceMax: "cheap" } })),
    ).toBeNull();
    expect(
      parseChatInterpretation(plan({ setFilters: { make: 7 } })),
    ).toBeNull();
  });

  it("refuses a negative or absurd ordinal", () => {
    for (const position of [0, -1, 999, 1.5]) {
      expect(
        parseChatInterpretation(
          plan({ kind: "reference", reference: { kind: "ordinal", position } }),
        ),
      ).toBeNull();
    }
  });

  it("refuses a comparison of fewer than two positions", () => {
    expect(
      parseChatInterpretation(
        plan({
          kind: "reference",
          reference: { kind: "compare", positions: [1] },
        }),
      ),
    ).toBeNull();
  });

  it("refuses a comparison containing any invalid position", () => {
    expect(
      parseChatInterpretation(
        plan({
          kind: "reference",
          setFilters: {},
          reference: { kind: "compare", positions: [1, 999, 2] },
        }),
      ),
    ).toBeNull();
  });

  it("refuses a reference kind carrying no reference", () => {
    expect(parseChatInterpretation(plan({ kind: "reference" }))).toBeNull();
  });

  it("refuses a clarify carrying no reason", () => {
    expect(parseChatInterpretation(plan({ kind: "clarify" }))).toBeNull();
  });

  it("refuses an unknown clarify reason", () => {
    expect(
      parseChatInterpretation(
        plan({ kind: "clarify", clarifyReason: "because" }),
      ),
    ).toBeNull();
  });

  it("refuses prose, truncation and non-JSON", () => {
    expect(parseChatInterpretation("I think they want a BMW")).toBeNull();
    expect(parseChatInterpretation('{"version":1,"kind":"sea')).toBeNull();
    expect(parseChatInterpretation("")).toBeNull();
  });

  it("rejects unknown top-level fields, including actions and destinations", () => {
    expect(
      parseChatInterpretation(
        plan({
          action: "navigate",
          vehicleId: "11111111-1111-4111-8111-111111111111",
          url: "/admin/platform",
          capabilityId: "vehicle.delete",
        }),
      ),
    ).toBeNull();
  });

  it("rejects unknown nested reference fields", () => {
    expect(
      parseChatInterpretation(
        plan({
          kind: "reference",
          reference: { kind: "ordinal", position: 2, vehicleId: "forged" },
        }),
      ),
    ).toBeNull();
  });

  it("rejects invalid clause members instead of silently dropping them", () => {
    expect(
      parseChatInterpretation(plan({ unsupportedClauses: ["valid", 7] })),
    ).toBeNull();
  });

  it("rejects oversized values instead of silently truncating the plan", () => {
    expect(
      parseChatInterpretation(plan({ setFilters: { make: "x".repeat(61) } })),
    ).toBeNull();
    expect(
      parseChatInterpretation(plan({ unsupportedClauses: ["x".repeat(121)] })),
    ).toBeNull();
    expect(
      parseChatInterpretation(
        plan({ unsupportedClauses: ["a", "b", "c", "d", "e"] }),
      ),
    ).toBeNull();
  });

  it("rejects non-null malformed reference and clarification values", () => {
    expect(parseChatInterpretation(plan({ reference: 0 }))).toBeNull();
    expect(parseChatInterpretation(plan({ clarifyReason: "" }))).toBeNull();
  });

  it("rejects contradictory filter ranges and set/clear overlap", () => {
    expect(
      parseChatInterpretation(
        plan({ setFilters: { priceMin: 70_000, priceMax: 40_000 } }),
      ),
    ).toBeNull();
    expect(
      parseChatInterpretation(
        plan({ setFilters: { year: 2026, yearMax: 2025 } }),
      ),
    ).toBeNull();
    expect(
      parseChatInterpretation(
        plan({ setFilters: { make: "BMW" }, clearFilters: ["make"] }),
      ),
    ).toBeNull();
    expect(
      parseChatInterpretation(
        plan({ kind: "reset", setFilters: { make: "BMW" } }),
      ),
    ).toBeNull();
  });

  it("rejects impossible years and semantically contradictory intent payloads", () => {
    expect(
      parseChatInterpretation(plan({ setFilters: { year: 20.26 } })),
    ).toBeNull();
    expect(
      parseChatInterpretation(plan({ setFilters: { year: 3000 } })),
    ).toBeNull();
    expect(
      parseChatInterpretation(
        plan({ kind: "present", setFilters: { make: "BMW" } }),
      ),
    ).toBeNull();
    expect(
      parseChatInterpretation(plan({ kind: "refine", setFilters: {} })),
    ).toBeNull();
    expect(
      parseChatInterpretation(
        plan({
          kind: "unsupported",
          unsupportedClauses: ["unknown"],
          setFilters: { make: "BMW" },
        }),
      ),
    ).toBeNull();
  });

  it("accepts a selected follow-up anchored only by the selected reference", () => {
    expect(
      parseChatInterpretation(
        plan({
          kind: "selected_followup",
          setFilters: {},
          reference: { kind: "selected" },
        }),
      ),
    ).toMatchObject({
      kind: "selected_followup",
      reference: { kind: "selected" },
    });
  });
});

describe("interpreter prompt and context stay bounded", () => {
  it("describes the schema without naming any tenant data", () => {
    const prompt = buildInterpretationSchemaPrompt();
    expect(prompt).toContain("You do not answer it");
    expect(prompt).toContain("cannot navigate, filter, open a page");
    expect(prompt).toContain("Never invent a make, model, price or vehicle");
  });

  it("sends shape and the visitor's own constraints, never the catalogue", () => {
    const state = {
      ...emptyConversationInventoryState(),
      activeFilters: { make: "BMW", priceMax: 70_000 },
      resultSet: {
        orderedIds: ["v1", "v2", "v3"],
        totalCount: 9,
        filtersApplied: { make: "BMW" },
        createdAtTurn: 1,
      },
      selectedVehicleId: "v2",
    };
    const context = buildInterpreterContext({
      state,
      deterministicFilters: { make: "BMW" },
    });
    expect(context.resultSetSize).toBe(3);
    expect(context.resultSetTotal).toBe(9);
    expect(context.hasSelection).toBe(true);

    const prompt = buildInterpreterContextPrompt(context);
    // Vehicle identity must never reach the interpreter.
    expect(prompt).not.toContain("v1");
    expect(prompt).not.toContain("v2");
    expect(prompt).toContain("Results currently on screen: 3");
  });

  it("says 'none' rather than inventing a search that is not active", () => {
    const context = buildInterpreterContext({
      state: emptyConversationInventoryState(),
      deterministicFilters: {},
    });
    expect(buildInterpreterContextPrompt(context)).toContain(
      "Active search: none",
    );
  });
});

describe("shadow comparison records fields, never content", () => {
  const candidate = parseChatInterpretation(
    plan({ kind: "search", setFilters: { make: "Toyota", model: "Camry" } }),
  )!;

  it("names which fields differ without recording their values", () => {
    const comparison = compareShadowInterpretation({
      deterministic: {
        kind: "search",
        filters: { make: "BMW" },
        hasReference: false,
      },
      candidate,
    });
    expect(comparison.kindAgrees).toBe(true);
    expect(comparison.filterFieldsDiffering.sort()).toEqual(["make", "model"]);
    expect(JSON.stringify(comparison)).not.toContain("Toyota");
    expect(JSON.stringify(comparison)).not.toContain("BMW");
  });

  it("reports agreement when both readings match", () => {
    const agreeing = parseChatInterpretation(
      plan({ setFilters: { make: "BMW" } }),
    )!;
    const comparison = compareShadowInterpretation({
      deterministic: {
        kind: "search",
        filters: { make: "BMW" },
        hasReference: false,
      },
      candidate: agreeing,
    });
    expect(comparison.filterFieldsDiffering).toEqual([]);
    expect(comparison.kindAgrees).toBe(true);
  });

  it("flags when only the candidate kept an unsupported clause", () => {
    const withClause = parseChatInterpretation(
      plan({ unsupportedClauses: ["book a test drive"] }),
    )!;
    const comparison = compareShadowInterpretation({
      deterministic: {
        kind: "search",
        filters: { make: "BMW" },
        hasReference: false,
      },
      candidate: withClause,
    });
    expect(comparison.candidateRetainedUnsupported).toBe(true);
  });

  it("notices a reference disagreement", () => {
    const reference = parseChatInterpretation(
      plan({
        kind: "reference",
        setFilters: {},
        reference: { kind: "ordinal", position: 2 },
      }),
    )!;
    const comparison = compareShadowInterpretation({
      deterministic: { kind: "search", filters: {}, hasReference: false },
      candidate: reference,
    });
    expect(comparison.referenceAgrees).toBe(false);
    expect(comparison.kindAgrees).toBe(false);
  });
});

describe("shadow mode is off unless two separate gates are opened", () => {
  it("is off by default", () => {
    expect(isShadowInterpretationEnabled("demo", undefined, undefined)).toBe(
      false,
    );
  });

  it("stays off with the flag alone", () => {
    // Otherwise enabling an environment would silently spend a model call on
    // every tenant's every unresolved turn.
    expect(isShadowInterpretationEnabled("demo", "true", undefined)).toBe(
      false,
    );
  });

  it("stays off for a tenant outside the allowlist", () => {
    expect(isShadowInterpretationEnabled("default", "true", "demo")).toBe(
      false,
    );
  });

  it("is on only for an allowlisted tenant in an enabled environment", () => {
    expect(isShadowInterpretationEnabled("demo", "true", "demo,other")).toBe(
      true,
    );
    expect(isShadowInterpretationEnabled(" DEMO ", "true", "demo")).toBe(true);
  });

  it("is off when the flag is anything other than true", () => {
    for (const value of ["1", "yes", "TRUE ", ""]) {
      expect(isShadowInterpretationEnabled("demo", value, "demo")).toBe(
        value.trim().toLowerCase() === "true",
      );
    }
  });
});

describe("gold set is usable as evidence", () => {
  it("is versioned", () => {
    expect(CHAT_INTERPRETATION_GOLD_SET_VERSION).toBe(2);
  });

  it("partitions by conversation, not by turn", () => {
    // Splitting turns would leak: a model that saw turn 3 looks better on
    // turn 4 than it has earned.
    const ids = CHAT_INTERPRETATION_GOLD_SET.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const conversation of CHAT_INTERPRETATION_GOLD_SET) {
      expect(["development", "held-out"]).toContain(conversation.partition);
    }
  });

  it("reports denominators so no percentage can be quoted bare", () => {
    const denominators = goldSetDenominators();
    expect(denominators.turns).toBeGreaterThan(0);
    expect(
      denominators.byPartition.development.turns +
        denominators.byPartition["held-out"].turns,
    ).toBe(denominators.turns);
    expect(denominators.byPartition["held-out"].conversations).toBeGreaterThan(
      0,
    );
  });

  it("only claims languages the product supports", () => {
    // Claiming multilingual coverage we do not have would make the suite lie
    // about what was measured.
    for (const conversation of CHAT_INTERPRETATION_GOLD_SET) {
      expect(conversation.locale).toBe("en");
    }
  });

  it("explains why every case exists, so none can be deleted to go green", () => {
    for (const conversation of CHAT_INTERPRETATION_GOLD_SET) {
      for (const turn of conversation.turns) {
        expect(turn.note.length).toBeGreaterThan(20);
        expect(turn.message.trim()).not.toBe("");
      }
    }
  });

  it("covers the historical failure classes", () => {
    const notes = CHAT_INTERPRETATION_GOLD_SET.flatMap((c) =>
      c.turns.map((t) => t.note.toLowerCase()),
    ).join(" ");
    for (const failure of [
      "cap must not survive",
      "numeral ordinal",
      "cadillac camry",
      "half",
    ]) {
      expect(notes).toContain(failure.toLowerCase());
    }
  });
});
