import { describe, expect, it } from "vitest";
import {
  evaluateChatInterpretations,
  matchesGoldTurn,
  type InterpretationEvaluationCase,
} from "./chatInterpretationEvaluation";
import {
  CHAT_INTERPRETATION_GOLD_SET,
  type GoldTurn,
} from "./chatInterpretationGoldSet";
import type { ChatInterpretation } from "./chatInterpretation";

function candidate(over: Partial<ChatInterpretation> = {}): ChatInterpretation {
  return {
    version: 1,
    kind: "search",
    setFilters: {},
    clearFilters: [],
    reference: null,
    clarifyReason: null,
    unsupportedClauses: [],
    ...over,
  };
}

describe("Phase 3 interpretation evaluation", () => {
  it("requires exact intent, filters, reference, clarification and clause retention", () => {
    const gold: GoldTurn = {
      message: "not recorded by the scorer",
      expected: {
        kind: "search",
        setFilters: { make: "BMW" },
        clearFilters: ["model"],
        expectUnsupported: true,
      },
      note: "fixture",
    };
    expect(
      matchesGoldTurn(
        candidate({
          setFilters: { make: "BMW" },
          clearFilters: ["model"],
          unsupportedClauses: ["book a test drive"],
        }),
        gold,
      ),
    ).toBe(true);
    expect(
      matchesGoldTurn(
        candidate({ setFilters: { make: "BMW" }, clearFilters: ["model"] }),
        gold,
      ),
    ).toBe(false);
  });

  it("counts provider failures, malformed plans and missing rows as abstentions", () => {
    const cases: InterpretationEvaluationCase[] = [
      {
        conversationId: "natural-budget-language",
        partition: "held-out",
        turn: 1,
        outcome: "timeout",
        candidate: null,
      },
      {
        conversationId: "natural-budget-language",
        partition: "held-out",
        turn: 2,
        outcome: "malformed",
        candidate: null,
      },
    ];
    const report = evaluateChatInterpretations({
      gold: CHAT_INTERPRETATION_GOLD_SET,
      cases,
    });
    expect(report.byPartition["held-out"].accepted).toBe(0);
    expect(report.byPartition["held-out"].abstentions).toBe(
      report.byPartition["held-out"].turns,
    );
    expect(report.activation.eligible).toBe(false);
  });

  it("can approve only a complete, perfect run of the independently reviewed held-out set", () => {
    const cases: InterpretationEvaluationCase[] = [];
    for (const conversation of CHAT_INTERPRETATION_GOLD_SET) {
      conversation.turns.forEach((turn, index) => {
        cases.push({
          conversationId: conversation.id,
          partition: conversation.partition,
          turn: index + 1,
          outcome: "accepted",
          candidate: candidate({
            kind: turn.expected.kind,
            setFilters: turn.expected.setFilters ?? {},
            clearFilters: turn.expected.clearFilters ?? [],
            reference: turn.expected.reference ?? null,
            clarifyReason: turn.expected.clarifyReason ?? null,
            unsupportedClauses: turn.expected.expectUnsupported
              ? ["retained"]
              : [],
          }),
        });
      });
    }
    const report = evaluateChatInterpretations({
      gold: CHAT_INTERPRETATION_GOLD_SET,
      cases,
    });
    expect(report.byPartition["held-out"].exactMatchRate).toBe(1);
    expect(report.byPartition["held-out"].acceptanceRate).toBe(1);
    expect(report.byPartition["held-out"].turns).toBeGreaterThanOrEqual(100);
    expect(report.activation.eligible).toBe(true);
    expect(report.activation.reasons).toEqual([]);
  });

  it("ignores duplicate and unknown result rows instead of inflating metrics", () => {
    const one = candidate({ kind: "clarify", clarifyReason: "ambiguous_make" });
    const cases: InterpretationEvaluationCase[] = [
      {
        conversationId: "ambiguity-and-mixed-requests",
        partition: "held-out",
        turn: 1,
        outcome: "accepted",
        candidate: one,
      },
      {
        conversationId: "ambiguity-and-mixed-requests",
        partition: "held-out",
        turn: 1,
        outcome: "accepted",
        candidate: one,
      },
      {
        conversationId: "not-a-case",
        partition: "held-out",
        turn: 1,
        outcome: "accepted",
        candidate: one,
      },
    ];
    const report = evaluateChatInterpretations({
      gold: CHAT_INTERPRETATION_GOLD_SET,
      cases,
    });
    expect(report.byPartition["held-out"].accepted).toBe(1);
  });
});
