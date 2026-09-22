import type { ChatInterpretation } from "./chatInterpretation";
import type { GoldConversation, GoldTurn } from "./chatInterpretationGoldSet";

export type InterpretationEvaluationCase = {
  conversationId: string;
  partition: GoldConversation["partition"];
  turn: number;
  outcome: "accepted" | "malformed" | "provider_error" | "timeout";
  candidate: ChatInterpretation | null;
};

export type InterpretationPartitionMetrics = {
  conversations: number;
  turns: number;
  accepted: number;
  exactMatches: number;
  abstentions: number;
  unsupportedCases: number;
  unsupportedRetained: number;
  exactMatchRate: number;
  acceptanceRate: number;
  unsupportedRetentionRate: number | null;
};

export type InterpretationEvaluationReport = {
  schemaVersion: 1;
  byPartition: Record<
    GoldConversation["partition"],
    InterpretationPartitionMetrics
  >;
  activation: {
    eligible: boolean;
    reasons: string[];
    /** Deliberately high: a handful of hand-authored cases cannot justify production. */
    minimumHeldOutTurns: number;
    requiredExactMatchRate: number;
    requiredAcceptanceRate: number;
  };
};

const MINIMUM_HELD_OUT_TURNS = 100;
const REQUIRED_EXACT_MATCH_RATE = 0.98;
const REQUIRED_ACCEPTANCE_RATE = 0.98;

/**
 * Score one provider run without exposing message text or model output.
 *
 * A malformed/timeout/provider error counts against BOTH coverage and exact
 * match. Otherwise a model that refuses every hard case could look perfect.
 */
export function evaluateChatInterpretations(input: {
  gold: readonly GoldConversation[];
  cases: readonly InterpretationEvaluationCase[];
}): InterpretationEvaluationReport {
  const expectedCases = new Map<
    string,
    { turn: GoldTurn; partition: GoldConversation["partition"] }
  >();
  for (const conversation of input.gold) {
    conversation.turns.forEach((turn, index) => {
      expectedCases.set(caseKey(conversation.id, index + 1), {
        turn,
        partition: conversation.partition,
      });
    });
  }

  const metrics = {
    development: emptyMetrics(),
    "held-out": emptyMetrics(),
  } satisfies Record<GoldConversation["partition"], MutableMetrics>;

  for (const conversation of input.gold) {
    metrics[conversation.partition].conversations += 1;
    metrics[conversation.partition].turns += conversation.turns.length;
    metrics[conversation.partition].unsupportedCases +=
      conversation.turns.filter(
        (turn) => turn.expected.expectUnsupported === true,
      ).length;
  }

  const seen = new Set<string>();
  for (const result of input.cases) {
    const key = caseKey(result.conversationId, result.turn);
    const goldCase = expectedCases.get(key);
    if (!goldCase || seen.has(key)) continue;
    seen.add(key);
    // Partition comes from the versioned gold set, never from provider output
    // or a caller-supplied result row that could misclassify a case.
    const partition = metrics[goldCase.partition];
    if (result.outcome !== "accepted" || !result.candidate) {
      partition.abstentions += 1;
      continue;
    }
    partition.accepted += 1;
    if (matchesGoldTurn(result.candidate, goldCase.turn))
      partition.exactMatches += 1;
    if (
      goldCase.turn.expected.expectUnsupported === true &&
      result.candidate.unsupportedClauses.length > 0
    ) {
      partition.unsupportedRetained += 1;
    }
  }

  // Missing provider results are abstentions, not invisible rows.
  for (const value of Object.values(metrics)) {
    value.abstentions += Math.max(
      0,
      value.turns - value.accepted - value.abstentions,
    );
  }

  const byPartition = {
    development: finalize(metrics.development),
    "held-out": finalize(metrics["held-out"]),
  };
  const heldOut = byPartition["held-out"];
  const reasons: string[] = [];
  if (heldOut.turns < MINIMUM_HELD_OUT_TURNS) {
    reasons.push(
      `held-out sample too small (${heldOut.turns}/${MINIMUM_HELD_OUT_TURNS} turns)`,
    );
  }
  if (heldOut.exactMatchRate < REQUIRED_EXACT_MATCH_RATE) {
    reasons.push(
      `held-out exact match below target (${heldOut.exactMatchRate.toFixed(3)}/${REQUIRED_EXACT_MATCH_RATE})`,
    );
  }
  if (heldOut.acceptanceRate < REQUIRED_ACCEPTANCE_RATE) {
    reasons.push(
      `held-out acceptance below target (${heldOut.acceptanceRate.toFixed(3)}/${REQUIRED_ACCEPTANCE_RATE})`,
    );
  }
  if (
    heldOut.unsupportedRetentionRate !== null &&
    heldOut.unsupportedRetentionRate < 1
  ) {
    reasons.push("held-out unsupported-clause retention is below 100%");
  }

  return {
    schemaVersion: 1,
    byPartition,
    activation: {
      eligible: reasons.length === 0,
      reasons,
      minimumHeldOutTurns: MINIMUM_HELD_OUT_TURNS,
      requiredExactMatchRate: REQUIRED_EXACT_MATCH_RATE,
      requiredAcceptanceRate: REQUIRED_ACCEPTANCE_RATE,
    },
  };
}

export function matchesGoldTurn(
  candidate: ChatInterpretation,
  gold: GoldTurn,
): boolean {
  const expected = gold.expected;
  return (
    candidate.kind === expected.kind &&
    stable(candidate.setFilters) === stable(expected.setFilters ?? {}) &&
    stable([...candidate.clearFilters].sort()) ===
      stable([...(expected.clearFilters ?? [])].sort()) &&
    stable(candidate.reference) === stable(expected.reference ?? null) &&
    candidate.clarifyReason === (expected.clarifyReason ?? null) &&
    (expected.expectUnsupported === true
      ? candidate.unsupportedClauses.length > 0
      : candidate.unsupportedClauses.length === 0)
  );
}

type MutableMetrics = Omit<
  InterpretationPartitionMetrics,
  "exactMatchRate" | "acceptanceRate" | "unsupportedRetentionRate"
>;

function emptyMetrics(): MutableMetrics {
  return {
    conversations: 0,
    turns: 0,
    accepted: 0,
    exactMatches: 0,
    abstentions: 0,
    unsupportedCases: 0,
    unsupportedRetained: 0,
  };
}

function finalize(value: MutableMetrics): InterpretationPartitionMetrics {
  return {
    ...value,
    exactMatchRate: value.turns > 0 ? value.exactMatches / value.turns : 0,
    acceptanceRate: value.turns > 0 ? value.accepted / value.turns : 0,
    unsupportedRetentionRate:
      value.unsupportedCases > 0
        ? value.unsupportedRetained / value.unsupportedCases
        : null,
  };
}

function caseKey(conversationId: string, turn: number): string {
  return `${conversationId}:${turn}`;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
