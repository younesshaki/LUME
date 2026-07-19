import type { ChatMessage } from "./OllamaChat.types";

const DSML_TOKEN_SOURCE = String.raw`[|｜]{1,2}DSML[|｜]{1,2}`;

/**
 * Migrate old local chat history defensively. Provider control markup was
 * briefly stored as assistant prose; it should disappear after refresh
 * without deleting the visitor's real conversation.
 */
export function sanitizeStoredChatMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ChatMessage[] => {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      (item.role !== "user" && item.role !== "assistant") ||
      typeof item.content !== "string"
    ) {
      return [];
    }
    const content =
      item.role === "assistant"
        ? stripLegacyProviderMarkup(item.content)
        : item.content;
    if (!content.trim()) return [];
    return [{
      id: item.id,
      role: item.role,
      content,
      ...(isStringArray(item.sourceCategories)
        ? { sourceCategories: item.sourceCategories }
        : {}),
      ...(isStringArray(item.thinkingSteps)
        ? { thinkingSteps: item.thinkingSteps }
        : {}),
    }];
  });
}

export function stripLegacyProviderMarkup(content: string): string {
  const completeBlock = new RegExp(
    `<${DSML_TOKEN_SOURCE}tool_calls\\s*>[\\s\\S]*?<\\/${DSML_TOKEN_SOURCE}tool_calls\\s*>`,
    "gi",
  );
  const withoutCompleteBlocks = content.replace(completeBlock, "");
  const firstRemainingMarker = new RegExp(`<\\/?${DSML_TOKEN_SOURCE}`, "i").exec(
    withoutCompleteBlocks,
  );
  const visible =
    firstRemainingMarker?.index === undefined
      ? withoutCompleteBlocks
      : withoutCompleteBlocks.slice(0, firstRemainingMarker.index);
  return visible
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
