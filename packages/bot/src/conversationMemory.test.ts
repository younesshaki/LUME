import { describe, expect, it } from "vitest";
import {
  FallbackConversationMemoryStore,
  InMemoryConversationMemoryStore,
  MAX_MEMORY_MESSAGES,
  MAX_MEMORY_TOOL_RESULTS,
  conversationMemoryToolPrompt,
  mergeRememberedMessages,
  type ConversationMemoryStore,
} from "./conversationMemory";

describe("conversation memory", () => {
  it("keeps the last 20 messages and five tool results for 24 hours", async () => {
    let now = Date.parse("2026-07-12T00:00:00.000Z");
    const store = new InMemoryConversationMemoryStore(() => now);
    const snapshot = await store.append("session", {
      messages: Array.from({ length: 25 }, (_, index) => ({
        role: index % 2 ? "assistant" as const : "user" as const,
        content: `message-${index}`,
      })),
      toolResults: Array.from({ length: 8 }, (_, index) => ({
        name: `tool-${index}`,
        result: { index },
      })),
    });
    expect(snapshot.messages).toHaveLength(MAX_MEMORY_MESSAGES);
    expect(snapshot.messages[0]?.content).toBe("message-5");
    expect(snapshot.toolResults).toHaveLength(MAX_MEMORY_TOOL_RESULTS);
    expect(snapshot.toolResults[0]?.name).toBe("tool-3");

    now += 24 * 60 * 60_000 + 1;
    await expect(store.get("session")).resolves.toBeNull();
  });

  it("merges an overlapping client transcript without duplicating turns", () => {
    const remembered = [
      { role: "user" as const, content: "one" },
      { role: "assistant" as const, content: "two" },
    ];
    expect(mergeRememberedMessages(remembered, [
      remembered[1],
      { role: "user", content: "three" },
    ])).toEqual([
      ...remembered,
      { role: "user", content: "three" },
    ]);
  });

  it("persists opaque server-owned conversation state with the same TTL", async () => {
    const store = new InMemoryConversationMemoryStore();
    await store.append("session", {
      conversationState: {
        activeFilters: { priceMax: 10_000 },
        resultSet: { orderedIds: ["vehicle-1"], totalCount: 1 },
      },
    });
    await store.append("session", { messages: [{ role: "user", content: "show me" }] });
    await expect(store.get("session")).resolves.toMatchObject({
      conversationState: { activeFilters: { priceMax: 10_000 } },
    });
  });

  it("falls back when the primary provider is unavailable", async () => {
    const unavailable: ConversationMemoryStore = {
      get: async () => { throw new Error("offline"); },
      append: async () => { throw new Error("offline"); },
      delete: async () => { throw new Error("offline"); },
    };
    const store = new FallbackConversationMemoryStore(
      unavailable,
      new InMemoryConversationMemoryStore(),
    );
    await store.append("session", { messages: [{ role: "user", content: "hello" }] });
    await expect(store.get("session")).resolves.toMatchObject({
      messages: [{ role: "user", content: "hello" }],
    });
    await expect(store.delete("session")).resolves.toBeUndefined();
  });

  it("builds a bounded prompt from cached tool data", () => {
    const prompt = conversationMemoryToolPrompt(Array.from({ length: 7 }, (_, index) => ({
      name: `tool-${index}`,
      result: { vehicleId: index },
      recordedAt: "2026-07-12T00:00:00.000Z",
    })));
    expect(prompt).not.toContain("tool-1");
    expect(prompt).toContain("tool-2");
    expect(prompt).toContain("tool-6");
    expect(prompt.length).toBeLessThanOrEqual(12_200);
  });
});
