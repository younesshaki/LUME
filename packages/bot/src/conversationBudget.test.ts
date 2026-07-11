import { describe, expect, it } from "vitest";
import {
  fitConversationToBudget,
  type BudgetMessage,
} from "./conversationBudget";

function message(
  id: string,
  role: BudgetMessage["role"],
  tokenCount: number,
  content = id
): BudgetMessage {
  return { id, role, tokenCount, content };
}

describe("fitConversationToBudget", () => {
  it("returns all messages unchanged at an exact boundary", () => {
    const messages = [
      message("system", "system", 20),
      message("user", "user", 10),
      message("assistant", "assistant", 10),
    ];

    expect(fitConversationToBudget(messages, 40)).toEqual({
      messages,
      totalTokens: 40,
      droppedMessages: 0,
      summarized: false,
    });
  });

  it("summarizes the oldest prefix while retaining the newest suffix", () => {
    const messages = [
      message("system", "system", 20, "Always use inventory context."),
      message("old-user", "user", 15, "I used to prefer coupes."),
      message("old-assistant", "assistant", 15, "Noted."),
      message("latest-user", "user", 20, "Show me an SUV."),
      message("latest-assistant", "assistant", 10, "Here are current SUVs."),
    ];

    const result = fitConversationToBudget(messages, 60, { summaryTokenLimit: 10 });

    expect(result.totalTokens).toBeLessThanOrEqual(60);
    expect(result.droppedMessages).toBe(2);
    expect(result.summarized).toBe(true);
    expect(result.messages.map((item) => item.id ?? item.kind)).toEqual([
      "system",
      "summary",
      "latest-user",
      "latest-assistant",
    ]);
    expect(result.messages.find((item) => item.kind === "summary")?.content).toMatch(
      /Earlier conversation/i
    );
  });

  it("preserves all system messages and the latest user message", () => {
    const messages = [
      message("system-1", "system", 10),
      message("old-user", "user", 20),
      message("system-2", "system", 5),
      message("latest-user", "user", 15),
    ];

    const result = fitConversationToBudget(messages, 35, { summaryTokenLimit: 0 });

    expect(result.messages.map((item) => item.id)).toEqual([
      "system-1",
      "system-2",
      "latest-user",
    ]);
    expect(result.totalTokens).toBe(30);
  });

  it("uses the protected messages only when they exactly consume the budget", () => {
    const messages = [
      message("system", "system", 20),
      message("old-user", "user", 10),
      message("old-assistant", "assistant", 10),
      message("latest-user", "user", 20),
    ];

    const result = fitConversationToBudget(messages, 40);
    expect(result.messages.map((item) => item.id)).toEqual(["system", "latest-user"]);
    expect(result.totalTokens).toBe(40);
    expect(result.summarized).toBe(false);
  });

  it("throws when protected messages cannot fit without violating the contract", () => {
    const messages = [
      message("system", "system", 20),
      message("latest-user", "user", 21),
    ];

    expect(() => fitConversationToBudget(messages, 40)).toThrow(/protected messages/i);
  });

  it("can trim a conversation with no user turn", () => {
    const messages = [
      message("system", "system", 10),
      message("old-assistant", "assistant", 15),
      message("new-assistant", "assistant", 10),
    ];

    const result = fitConversationToBudget(messages, 20, { summaryTokenLimit: 0 });
    expect(result.messages.map((item) => item.id)).toEqual(["system", "new-assistant"]);
  });

  it("rejects invalid budgets and token estimates", () => {
    expect(() => fitConversationToBudget([], -1)).toThrow(/budget/i);
    expect(() =>
      fitConversationToBudget([message("invalid", "user", -1)], 10)
    ).toThrow(/tokenCount/i);
    expect(() =>
      fitConversationToBudget([], 10, { summaryTokenLimit: 1.5 })
    ).toThrow(/summaryTokenLimit/i);
  });
});
