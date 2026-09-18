import type { MemoryMessage } from "@lume/bot";
import { buildChatCompletionBody } from "./chatProvider";
import type { ResolvedChatProvider } from "./chatProviderResolution";
import { buildInterpretationSchemaPrompt, parseChatInterpretation } from "./chatInterpretation";
import {
  buildInterpreterContextPrompt,
  compareShadowInterpretation,
  type DeterministicOutcome,
  type InterpreterContext,
  type ShadowComparison,
} from "./chatInterpretationShadow";

/**
 * One bounded interpretation call, for shadow evaluation only.
 *
 * Nothing this returns can reach the visitor. The caller records the
 * comparison and discards the plan — no action, no state, no memory write, no
 * effect on the response. Every failure mode (timeout, malformed JSON, a
 * provider outage) resolves to null, because a shadow experiment that can
 * break a real conversation is not a shadow experiment.
 */

/** Hard ceiling. A shadow call must never outlive the turn it observes. */
const SHADOW_TIMEOUT_MS = 6_000;
/** Only the last message is interpreted; history is the deterministic layer's job. */
const MAX_MESSAGE_LENGTH = 600;

export type ShadowInterpretationResult = {
  comparison: ShadowComparison;
  /** Upstream calls this experiment added to the turn. Always exactly one. */
  modelCalls: 1;
  durationMs: number;
};

export async function runShadowInterpretation(input: {
  provider: ResolvedChatProvider;
  userMessage: string;
  context: InterpreterContext;
  deterministic: DeterministicOutcome;
  now?: () => number;
}): Promise<ShadowInterpretationResult | null> {
  const startedAt = (input.now ?? Date.now)();
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
        }),
      ),
    });
    if (!response.ok) return null;
    const parsed = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = parsed.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;

    const candidate = parseChatInterpretation(content);
    // A malformed plan is a real, recordable outcome, but there is nothing to
    // compare it against — the caller counts it as an abstention.
    if (!candidate) return null;

    return {
      comparison: compareShadowInterpretation({
        deterministic: input.deterministic,
        candidate,
      }),
      modelCalls: 1,
      durationMs: (input.now ?? Date.now)() - startedAt,
    };
  } catch {
    // Includes the abort. A shadow call never surfaces an error anywhere.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
