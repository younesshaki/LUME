import { describe, expect, it, vi } from "vitest";
import {
  UpstashConversationMemoryStore,
  adminConversationMemoryKey,
  conversationMemoryKey,
} from "./conversationMemory.server";

describe("Upstash conversation memory adapter", () => {
  it("writes a 24-hour bounded snapshot and reads it back", async () => {
    let stored: unknown = null;
    const redis = {
      get: vi.fn(async () => stored),
      set: vi.fn(async (_key: string, value: unknown) => { stored = value; return "OK"; }),
      del: vi.fn(async () => 1),
    };
    const store = new UpstashConversationMemoryStore(
      redis,
      () => Date.parse("2026-07-12T00:00:00.000Z"),
    );
    await store.append("key", { messages: [{ role: "user", content: "hello" }] });
    await expect(store.get("key")).resolves.toMatchObject({
      messages: [{ role: "user", content: "hello" }],
    });
    expect(redis.set).toHaveBeenCalledWith("key", expect.any(Object), { ex: 86_400 });
  });

  it("uses a stable opaque tenant/visitor key", () => {
    const key = conversationMemoryKey("tenant-1", "visitor-1");
    expect(key).toMatch(/^lume:conversation:v1:[a-f0-9]{64}$/);
    expect(key).not.toContain("tenant-1");
    expect(key).not.toContain("visitor-1");
  });

  it("isolates admin result sets by tenant, authenticated actor, and browser session", () => {
    const base = adminConversationMemoryKey("tenant-1", "user-1", "11111111-1111-4111-8111-111111111111");
    expect(base).toMatch(/^lume:admin-conversation:v1:[a-f0-9]{64}$/);
    expect(base).not.toBe(adminConversationMemoryKey("tenant-1", "user-2", "11111111-1111-4111-8111-111111111111"));
    expect(base).not.toBe(adminConversationMemoryKey("tenant-1", "user-1", "22222222-2222-4222-8222-222222222222"));
    expect(base).not.toBe(conversationMemoryKey("tenant-1", "user-1"));
  });
});
