import { describe, expect, it } from "vitest";
import {
  MAX_OUTBOUND_MESSAGES,
  buildOutboundMessages,
  trimOutboundHistory,
} from "./OllamaChat.history";
import type { OllamaApiMessage } from "./OllamaChat.types";

/** Alternating conversation: user, assistant, user, assistant, … */
const conversation = (count: number): OllamaApiMessage[] =>
  Array.from({ length: count }, (_, index) => ({
    role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
    content: `m${index}`,
  }));

describe("trimOutboundHistory", () => {
  it("leaves a short conversation untouched", () => {
    const messages = conversation(6);
    expect(trimOutboundHistory(messages, 20)).toEqual(messages);
  });

  it("keeps the most recent turns once over the cap", () => {
    const trimmed = trimOutboundHistory(conversation(40), 10);
    expect(trimmed.at(-1)?.content).toBe("m39");
    expect(trimmed.length).toBeLessThanOrEqual(10);
  });

  it("never begins on a dangling assistant reply", () => {
    // A window that opened on an answer whose question was trimmed reads as a
    // thread the model should continue, but the visitor cannot see it.
    for (let size = 21; size < 60; size++) {
      const trimmed = trimOutboundHistory(conversation(size), 20);
      expect(trimmed[0]?.role, `size ${size}`).toBe("user");
    }
  });

  it("returns fewer than the cap when the boundary demands it", () => {
    // Cutting to a user turn can cost one message. A short coherent window is
    // the intent, not a bug.
    const trimmed = trimOutboundHistory(conversation(40), 9);
    expect(trimmed.length).toBe(8);
    expect(trimmed[0].role).toBe("user");
  });

  it("keeps the tail when there is no user turn to cut to", () => {
    const allAssistant: OllamaApiMessage[] = Array.from({ length: 30 }, () => ({
      role: "assistant" as const,
      content: "a",
    }));
    expect(trimOutboundHistory(allAssistant, 5)).toHaveLength(5);
  });

  it("handles a zero cap without throwing", () => {
    expect(trimOutboundHistory(conversation(10), 0)).toEqual([]);
  });
});

describe("buildOutboundMessages", () => {
  it("always ends with the new question", () => {
    const payload = buildOutboundMessages(conversation(100), "what SUVs do you have?");
    expect(payload.at(-1)).toEqual({ role: "user", content: "what SUVs do you have?" });
  });

  it("stays within the cap no matter how long the conversation ran", () => {
    for (const length of [0, 1, 19, 20, 21, 40, 200, 1000]) {
      const payload = buildOutboundMessages(conversation(length), "next");
      expect(payload.length, `history ${length}`).toBeLessThanOrEqual(MAX_OUTBOUND_MESSAGES);
    }
  });

  it("stays under the server's limit, which is what the 400 wall was", () => {
    // The route rejects > 30. This is the regression that mattered: at
    // exchange 16 every send failed and stayed failed until reset.
    const SERVER_MAX = 30;
    const payload = buildOutboundMessages(conversation(400), "still working?");
    expect(payload.length).toBeLessThanOrEqual(SERVER_MAX);
  });

  it("sends the question alone when there is no history", () => {
    expect(buildOutboundMessages([], "hello")).toEqual([{ role: "user", content: "hello" }]);
  });
});
