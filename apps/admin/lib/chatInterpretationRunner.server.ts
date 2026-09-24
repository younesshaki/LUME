import type { MemoryMessage } from "@lume/bot";
import { buildChatCompletionBody } from "./chatProvider";
import type { ResolvedChatProvider } from "./chatProviderResolution";
import {
  CHAT_INTERPRETATION_JSON_SCHEMA,
  buildInterpretationSchemaPrompt,
  parseChatInterpretation,
  type ChatInterpretation,
} from "./chatInterpretation";
import {
  buildInterpreterContextPrompt,
  compareShadowInterpretation,
  type DeterministicOutcome,
  type InterpreterContext,
  type ShadowComparison,
} from "./chatInterpretationShadow";

/**
 * One bounded interpretation call for shadow evaluation or an active canary.
 *
 * The runner only validates a closed meaning plan. It cannot create actions,
 * ids, URLs, queries, or memory writes. Every failure resolves to null so the
 * caller can retain the established model path without weakening availability.
 */

/** Hard ceiling. A shadow call must never outlive the turn it observes. */
const SHADOW_TIMEOUT_MS = 6_000;
/** Only the last message is interpreted; history is the deterministic layer's job. */
const MAX_MESSAGE_LENGTH = 600;
/** Bounded classification output; prevents a malformed provider from rambling. */
const MAX_OUTPUT_TOKENS = 350;

export type ShadowInterpretationResult = {
  outcome: "accepted" | "malformed" | "provider_error" | "timeout";
  comparison: ShadowComparison | null;
  /** Internal evaluation output. Never include this in production telemetry. */
  candidate: ChatInterpretation | null;
  /** Upstream calls this experiment added to the turn. Always exactly one. */
  modelCalls: 1;
  durationMs: number;
  usage: { inputTokens: number | null; outputTokens: number | null };
};

export async function runShadowInterpretation(input: {
  provider: ResolvedChatProvider;
  userMessage: string;
  context: InterpreterContext;
  deterministic: DeterministicOutcome;
  now?: () => number;
}): Promise<ShadowInterpretationResult> {
  const startedAt = (input.now ?? Date.now)();
  const elapsed = () => (input.now ?? Date.now)() - startedAt;
  const failed = (
    outcome: Exclude<ShadowInterpretationResult["outcome"], "accepted">,
  ): ShadowInterpretationResult => ({
    outcome,
    comparison: null,
    candidate: null,
    modelCalls: 1,
    durationMs: elapsed(),
    usage: { inputTokens: null, outputTokens: null },
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SHADOW_TIMEOUT_MS);
  try {
    const messages: MemoryMessage[] = [
      {
        role: "user",
        content: `${buildInterpreterContextPrompt(input.context)}\n\nVisitor message: ${input.userMessage.slice(0, MAX_MESSAGE_LENGTH)}`,
      },
    ];
    const response = await fetch(input.provider.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.provider.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify(
        buildChatCompletionBody({
          modelId: input.provider.profile.id,
          stream: false,
          messages: [
            { role: "system", content: buildInterpretationSchemaPrompt() },
            ...messages,
          ] as MemoryMessage[],
          toolFields: {
            max_tokens: MAX_OUTPUT_TOKENS,
            // Moonshot's Kimi K2.6 rejects every temperature except 0.6.
            // Keep deterministic-capable providers at zero while using the
            // provider's required setting; the closed plan schema remains the
            // authority over output shape and meaning in both cases.
            temperature:
              input.provider.profile.provider === "moonshot" ? 0.6 : 0,
            ...structuredOutputRequestFields(input.provider),
          },
        }),
      ),
    });
    if (!response.ok) {
      await response.text().catch(() => "");
      return failed("provider_error");
    }
    let parsed: {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    try {
      parsed = (await response.json()) as typeof parsed;
    } catch {
      return failed("malformed");
    }
    const content = parsed.choices?.[0]?.message?.content;
    if (typeof content !== "string") return failed("malformed");

    const candidate = parseChatInterpretation(content);
    if (!candidate) return failed("malformed");

    return {
      outcome: "accepted",
      candidate,
      comparison: compareShadowInterpretation({
        deterministic: input.deterministic,
        candidate,
      }),
      modelCalls: 1,
      durationMs: elapsed(),
      usage: {
        inputTokens: parsed.usage?.prompt_tokens ?? null,
        outputTokens: parsed.usage?.completion_tokens ?? null,
      },
    };
  } catch (error) {
    // A shadow call never surfaces an error to the visitor, but an attempted
    // paid call must remain visible in evaluation telemetry even when it
    // timed out or returned unusable output.
    return failed(
      (error instanceof DOMException || error instanceof Error) &&
        error.name === "AbortError"
        ? "timeout"
        : "provider_error",
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Keep provider differences at the transport boundary, never in the intent
 * parser. Gateway supports strict JSON Schema and Moonshot supports
 * JSON-object mode. The strict TypeScript parser still rejects every
 * unexpected or contradictory value after either response. Other direct
 * adapters retain prompt-only JSON until they have their own measured
 * compatibility evidence.
 */
function structuredOutputRequestFields(
  provider: ResolvedChatProvider,
): Record<string, unknown> {
  if (provider.profile.provider === "gateway") {
    return {
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "lume_concierge_interpretation",
          strict: true,
          schema: CHAT_INTERPRETATION_JSON_SCHEMA,
        },
      },
    };
  }

  return provider.profile.provider === "moonshot"
    ? { response_format: { type: "json_object" } }
    : {};
}
