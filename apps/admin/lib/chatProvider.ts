import type { LlmToolCall } from "@lume/bot";
import {
  getConciergeModelProfile,
  type ConciergeModelId,
  type ConciergeModelProfile,
} from "./conciergeModels";
import { normalizeDeepseekAssistantMessage } from "./botActions";

export type ProviderAssistantMessage = {
  content: string;
  reasoningContent: string | null;
  toolCalls: LlmToolCall[];
};

type RawProviderAssistantMessage = {
  content?: string | null;
  reasoning_content?: string | null;
  tool_calls?: readonly LlmToolCall[] | null;
};

type ChatCompletionBodyInput = {
  modelId: ConciergeModelId;
  stream: boolean;
  messages: readonly unknown[];
  toolFields?: Readonly<Record<string, unknown>>;
};

/**
 * Build the provider-compatible request without coupling the route to one
 * vendor. All current profiles use OpenAI Chat Completions; model-specific
 * reasoning controls remain centralized here.
 */
export function buildChatCompletionBody({
  modelId,
  stream,
  messages,
  toolFields = {},
}: ChatCompletionBodyInput): Record<string, unknown> {
  const profile = getConciergeModelProfile(modelId);
  return {
    model: profile.id,
    stream,
    messages,
    ...toolFields,
    ...(profile.thinkingMode === "max"
      ? { reasoning_effort: "max" }
      : { thinking: { type: "disabled" } }),
  };
}

/**
 * DeepSeek has a narrowly contained legacy DSML recovery path. Other
 * OpenAI-compatible providers accept only structured tool_calls.
 */
export function normalizeProviderAssistantMessage(
  profile: ConciergeModelProfile,
  message: RawProviderAssistantMessage,
  allowedToolNames: readonly string[],
): ProviderAssistantMessage {
  if (profile.provider === "deepseek") {
    const normalized = normalizeDeepseekAssistantMessage(
      message,
      allowedToolNames,
    );
    return {
      content: normalized.content,
      reasoningContent: message.reasoning_content ?? null,
      toolCalls: normalized.toolCalls,
    };
  }

  return {
    content: message.content ?? "",
    reasoningContent: message.reasoning_content ?? null,
    toolCalls: message.tool_calls ? [...message.tool_calls] : [],
  };
}

/** Preserve reasoning state when a thinking model requested a tool. */
export function assistantToolCallMessage(
  message: ProviderAssistantMessage,
): Record<string, unknown> {
  return {
    role: "assistant",
    content: message.content,
    tool_calls: message.toolCalls,
    ...(message.reasoningContent
      ? { reasoning_content: message.reasoningContent }
      : {}),
  };
}
