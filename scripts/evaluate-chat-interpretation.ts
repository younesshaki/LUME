#!/usr/bin/env npx tsx
import { evaluateChatInterpretations } from "../apps/admin/lib/chatInterpretationEvaluation";
import {
  CHAT_INTERPRETATION_GOLD_SET,
  CHAT_INTERPRETATION_GOLD_SET_VERSION,
  type GoldTurn,
} from "../apps/admin/lib/chatInterpretationGoldSet";
import { runShadowInterpretation } from "../apps/admin/lib/chatInterpretationRunner.server";
import { resolveChatProviderFromEnvironment } from "../apps/admin/lib/chatProviderResolution";
import type { VehicleQueryFilters } from "@lume/rag";

const requestedPartition = process.argv.includes("--held-out")
  ? "held-out"
  : "development";

if (process.env.CONCIERGE_INTERPRETATION_EVAL !== "1") {
  fail(
    "Refusing provider calls. Set CONCIERGE_INTERPRETATION_EVAL=1 to run the versioned fixture evaluation.",
  );
}
if (
  requestedPartition === "held-out" &&
  process.env.CONCIERGE_INTERPRETATION_EVAL_CONFIRM !== "held-out"
) {
  fail(
    "Held-out evaluation is intentionally separate. Set CONCIERGE_INTERPRETATION_EVAL_CONFIRM=held-out to run it.",
  );
}

const requestedModel = process.env.CONCIERGE_INTERPRETATION_EVAL_MODEL?.trim();
if (!requestedModel) {
  fail(
    "Set CONCIERGE_INTERPRETATION_EVAL_MODEL to the exact model profile to evaluate.",
  );
}

const provider = resolveChatProviderFromEnvironment(
  requestedModel,
  process.env,
);
if (!provider) fail("The requested model provider has no configured API key.");
if (provider.fellBack || provider.requestedModelId !== provider.profile.id) {
  fail(
    `Requested model ${requestedModel} is not configured; refusing to score fallback ${provider.profile.id}.`,
  );
}

const selected = CHAT_INTERPRETATION_GOLD_SET.filter(
  (conversation) => conversation.partition === requestedPartition,
);
const cases = [];
let inputTokens = 0;
let outputTokens = 0;
let usageComplete = true;

for (const conversation of selected) {
  let activeFilters: VehicleQueryFilters = {};
  for (let index = 0; index < conversation.turns.length; index += 1) {
    const turn = conversation.turns[index]!;
    const result = await runShadowInterpretation({
      provider,
      userMessage: turn.message,
      context: {
        surface: "public",
        activeFilters,
        resultSetSize: 3,
        resultSetTotal: 3,
        hasSelection: false,
        deterministicFilters: {},
        pendingClarification: null,
      },
      // Evaluation compares the candidate to independent gold below. This
      // placeholder is required only because the production shadow runner
      // also records deterministic disagreement.
      deterministic: {
        kind: turn.expected.kind,
        filters: (turn.expected.setFilters ?? {}) as VehicleQueryFilters,
        hasReference: turn.expected.reference !== undefined,
      },
    });
    cases.push({
      conversationId: conversation.id,
      partition: conversation.partition,
      turn: index + 1,
      outcome: result.outcome,
      candidate: result.candidate,
    });
    if (
      result.usage.inputTokens === null ||
      result.usage.outputTokens === null
    ) {
      usageComplete = false;
    } else {
      inputTokens += result.usage.inputTokens;
      outputTokens += result.usage.outputTokens;
    }
    activeFilters = expectedStateAfter(activeFilters, turn.expected);
  }
}

const report = evaluateChatInterpretations({
  gold: selected,
  cases,
});

console.info(
  JSON.stringify(
    {
      goldSetVersion: CHAT_INTERPRETATION_GOLD_SET_VERSION,
      model: provider.profile.id,
      provider: provider.profile.provider,
      partition: requestedPartition,
      metrics: report.byPartition[requestedPartition],
      activation: report.activation,
      usage: {
        complete: usageComplete,
        inputTokens: usageComplete ? inputTokens : null,
        outputTokens: usageComplete ? outputTokens : null,
      },
      // IDs are safe fixture identifiers. Messages and model plans are never
      // printed, keeping the evaluator suitable for CI logs.
      cases: cases.map((entry) => ({
        id: `${entry.conversationId}:${entry.turn}`,
        outcome: entry.outcome,
      })),
    },
    null,
    2,
  ),
);

function expectedStateAfter(
  previous: VehicleQueryFilters,
  expected: GoldTurn["expected"],
): VehicleQueryFilters {
  const next: VehicleQueryFilters =
    expected.kind === "reset" || expected.kind === "search"
      ? {}
      : { ...previous };
  for (const key of expected.clearFilters ?? []) delete next[key];
  return { ...next, ...(expected.setFilters ?? {}) } as VehicleQueryFilters;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
