export type ConversationRole = "system" | "user" | "assistant" | "tool";

export type BudgetMessage = {
  id?: string;
  role: ConversationRole;
  content: string;
  /** Rough token count supplied by the caller's tokenizer/estimator. */
  tokenCount: number;
  kind?: "message" | "summary";
};

export type ConversationBudgetOptions = {
  /** Maximum rough tokens allocated to the deterministic dropped-turn summary. */
  summaryTokenLimit?: number;
};

export type ConversationBudgetResult = {
  messages: BudgetMessage[];
  totalTokens: number;
  droppedMessages: number;
  summarized: boolean;
};

export const DEFAULT_SUMMARY_TOKEN_LIMIT = 24;

/**
 * Keep a conversation within a hard token budget. System messages and the
 * latest user message are protected; newest remaining messages are retained
 * as a suffix, and the dropped prefix is represented by a compact,
 * deterministic summary when budget permits.
 *
 * Throws when the protected messages alone exceed the budget, because no
 * function can both preserve them and satisfy the hard cap.
 */
export function fitConversationToBudget(
  messages: readonly BudgetMessage[],
  budget: number,
  options: ConversationBudgetOptions = {}
): ConversationBudgetResult {
  assertNonNegativeInteger(budget, "budget");
  const summaryTokenLimit = options.summaryTokenLimit ?? DEFAULT_SUMMARY_TOKEN_LIMIT;
  assertNonNegativeInteger(summaryTokenLimit, "summaryTokenLimit");
  messages.forEach((message, index) =>
    assertNonNegativeInteger(message.tokenCount, `messages[${index}].tokenCount`)
  );

  const originalTotal = sumTokens(messages);
  if (originalTotal <= budget) {
    return {
      messages: [...messages],
      totalTokens: originalTotal,
      droppedMessages: 0,
      summarized: false,
    };
  }

  const protectedIndexes = protectedMessageIndexes(messages);
  const protectedTokens = sumTokens(
    messages.filter((_message, index) => protectedIndexes.has(index))
  );
  if (protectedTokens > budget) {
    throw new RangeError(
      `Token budget ${budget} is smaller than the ${protectedTokens} tokens required by protected messages.`
    );
  }

  const availableAfterProtected = budget - protectedTokens;
  const summaryReserve = summaryTokenLimit > 0 && availableAfterProtected > 0
    ? Math.min(summaryTokenLimit, availableAfterProtected)
    : 0;
  const keptIndexes = new Set(protectedIndexes);
  let keptTokens = protectedTokens;
  let stoppedAt = -1;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (protectedIndexes.has(index)) continue;
    const message = messages[index];
    if (keptTokens + message.tokenCount + summaryReserve <= budget) {
      keptIndexes.add(index);
      keptTokens += message.tokenCount;
    } else {
      stoppedAt = index;
      break;
    }
  }

  const dropped = messages.filter(
    (_message, index) => !keptIndexes.has(index) && (stoppedAt < 0 || index <= stoppedAt)
  );
  const summary = summaryReserve > 0 && dropped.length > 0
    ? summarizeDroppedMessages(dropped, summaryReserve)
    : null;
  const kept = messages.filter((_message, index) => keptIndexes.has(index));
  const output = summary ? insertAfterLeadingSystemMessages(kept, summary) : kept;

  return {
    messages: output,
    totalTokens: keptTokens + (summary?.tokenCount ?? 0),
    droppedMessages: dropped.length,
    summarized: summary !== null,
  };
}

function protectedMessageIndexes(messages: readonly BudgetMessage[]): Set<number> {
  const indexes = new Set<number>();
  let latestUserIndex = -1;

  messages.forEach((message, index) => {
    if (message.role === "system") indexes.add(index);
    if (message.role === "user") latestUserIndex = index;
  });

  if (latestUserIndex >= 0) indexes.add(latestUserIndex);
  return indexes;
}

function summarizeDroppedMessages(
  messages: readonly BudgetMessage[],
  tokenLimit: number
): BudgetMessage {
  const droppedTokens = sumTokens(messages);
  const tokenCount = Math.max(1, Math.min(tokenLimit, droppedTokens));
  const characterLimit = tokenCount * 4;
  const details = messages
    .map((message) => `${message.role}: ${message.content.replace(/\s+/g, " ").trim()}`)
    .filter((line) => !line.endsWith(": "))
    .join(" | ");
  const fullSummary = `Earlier conversation: ${details || `${messages.length} message(s) omitted.`}`;
  const content = fullSummary.length <= characterLimit
    ? fullSummary
    : `${fullSummary.slice(0, Math.max(0, characterLimit - 1)).trimEnd()}…`;

  return {
    role: "assistant",
    kind: "summary",
    content,
    tokenCount,
  };
}

function insertAfterLeadingSystemMessages(
  messages: readonly BudgetMessage[],
  summary: BudgetMessage
): BudgetMessage[] {
  const insertionIndex = messages.findIndex((message) => message.role !== "system");
  const index = insertionIndex < 0 ? messages.length : insertionIndex;
  return [...messages.slice(0, index), summary, ...messages.slice(index)];
}

function sumTokens(messages: readonly BudgetMessage[]): number {
  return messages.reduce((total, message) => total + message.tokenCount, 0);
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer.`);
  }
}
