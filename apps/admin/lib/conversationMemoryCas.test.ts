import { describe, expect, it } from "vitest";
import { ConversationMemoryConflictError } from "@lume/bot";
import { UpstashConversationMemoryStore } from "./conversationMemory.server";

const NOW = Date.parse("2026-09-12T10:00:00.000Z");

/**
 * A Redis stand-in that implements the two behaviours the store depends on:
 * JSON get/set, and an `eval` that applies the compare-and-set script's
 * semantics (commit only if the stored stateVersion still matches).
 *
 * This proves the store's protocol — read, compute, commit-if-unchanged,
 * retry — not the Lua text itself. The script has not been executed against a
 * real Redis here; that belongs to a staging verification with Upstash
 * configured.
 */
class FakeRedis {
  values = new Map<string, string>();
  evalCalls = 0;
  setCalls = 0;

  async get(key: string): Promise<unknown> {
    const raw = this.values.get(key);
    return raw === undefined ? null : JSON.parse(raw);
  }

  async set(key: string, value: unknown): Promise<unknown> {
    this.setCalls += 1;
    this.values.set(key, JSON.stringify(value));
    return "OK";
  }

  async del(key: string): Promise<unknown> {
    this.values.delete(key);
    return 1;
  }

  async eval(_script: string, keys: string[], args: string[]): Promise<unknown> {
    this.evalCalls += 1;
    const key = keys[0]!;
    const [nextJson, expectedVersion] = args;
    const stored = this.values.get(key);
    let currentVersion = 0;
    if (stored) {
      const decoded = JSON.parse(stored) as { stateVersion?: number };
      currentVersion = Number(decoded.stateVersion ?? 0);
    }
    if (currentVersion !== Number(expectedVersion)) return currentVersion;
    this.values.set(key, nextJson!);
    return -1;
  }
}

/** A client with no scripting support, like the minimal fakes in older tests. */
class FakeRedisWithoutEval {
  values = new Map<string, string>();
  setCalls = 0;
  async get(key: string): Promise<unknown> {
    const raw = this.values.get(key);
    return raw === undefined ? null : JSON.parse(raw);
  }
  async set(key: string, value: unknown): Promise<unknown> {
    this.setCalls += 1;
    this.values.set(key, JSON.stringify(value));
    return "OK";
  }
  async del(key: string): Promise<unknown> {
    this.values.delete(key);
    return 1;
  }
}

describe("Upstash memory store: compare-and-set", () => {
  it("commits through the script when the key is untouched", async () => {
    const redis = new FakeRedis();
    const store = new UpstashConversationMemoryStore(redis, () => NOW);
    const snapshot = await store.append("k", {
      messages: [{ role: "user", content: "hello" }],
    });
    expect(snapshot.stateVersion).toBe(1);
    expect(redis.evalCalls).toBe(1);
    // The plain SET path must not run when scripting is available.
    expect(redis.setCalls).toBe(0);
  });

  it("does not lose an update when two turns interleave", async () => {
    // The lost-update case: both turns read version N. Without CAS both write
    // N+1 and the first turn's message disappears.
    const redis = new FakeRedis();
    const store = new UpstashConversationMemoryStore(redis, () => NOW);

    const slow = store.append("k", {
      messages: [{ role: "user", content: "first" }],
    });
    const fast = store.append("k", {
      messages: [{ role: "user", content: "second" }],
    });
    await Promise.all([slow, fast]);

    const final = await store.get("k");
    expect(final?.messages.map((m) => m.content).sort()).toEqual([
      "first",
      "second",
    ]);
    expect(final?.stateVersion).toBe(2);
  });

  it("refuses to retry a turn that pinned an older version", async () => {
    // A late response must not be re-applied on top of newer state.
    const redis = new FakeRedis();
    const store = new UpstashConversationMemoryStore(redis, () => NOW);
    await store.append("k", { messages: [{ role: "user", content: "a" }] });

    await expect(
      store.append("k", {
        expectedStateVersion: 0,
        conversationState: { stale: true },
      }),
    ).rejects.toBeInstanceOf(ConversationMemoryConflictError);

    const final = await store.get("k");
    expect(final?.conversationState).toBeUndefined();
  });

  it("answers a replayed request from the stored snapshot", async () => {
    const redis = new FakeRedis();
    const store = new UpstashConversationMemoryStore(redis, () => NOW);
    const update = {
      requestId: "req-1",
      messages: [{ role: "user" as const, content: "only once" }],
    };
    await store.append("k", update);
    const replayed = await store.append("k", update);
    expect(replayed.messages).toHaveLength(1);
    expect(replayed.stateVersion).toBe(1);
  });

  it("falls back to a plain write when the client cannot script", async () => {
    // Correct for a single writer, which is what a client without eval gets.
    const redis = new FakeRedisWithoutEval();
    const store = new UpstashConversationMemoryStore(redis, () => NOW);
    const snapshot = await store.append("k", {
      messages: [{ role: "user", content: "hello" }],
    });
    expect(snapshot.stateVersion).toBe(1);
    expect(redis.setCalls).toBe(1);
  });

  it("expires a snapshot by its own timestamp, not only by Redis TTL", async () => {
    const redis = new FakeRedis();
    const store = new UpstashConversationMemoryStore(redis, () => NOW);
    await store.append("k", { messages: [{ role: "user", content: "x" }] });

    const laterStore = new UpstashConversationMemoryStore(
      redis,
      () => NOW + 25 * 60 * 60 * 1_000,
    );
    expect(await laterStore.get("k")).toBeNull();
  });
});
