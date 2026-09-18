import { describe, expect, it } from "vitest";
import {
  CONVERSATION_CLAIM_TTL_SECONDS,
  FallbackConversationMemoryStore,
  InMemoryConversationMemoryStore,
  type ConversationMemoryStore,
} from "@lume/bot";
import {
  UpstashConversationMemoryStore,
  conversationClaimKey,
  conversationMemoryKey,
} from "./conversationMemory.server";

const NOW = Date.parse("2026-09-16T10:00:00.000Z");
const TTL = CONVERSATION_CLAIM_TTL_SECONDS;

/**
 * Redis stand-in implementing the two behaviours the lease depends on: SET
 * with an expiry, and NX making the write conditional on absence.
 */
class FakeRedis {
  values = new Map<string, { value: unknown; expiresAtMs: number }>();
  setCalls: Array<{ key: string; nx: boolean }> = [];
  constructor(private nowMs = NOW) {}

  advance(ms: number): void {
    this.nowMs += ms;
  }

  private live(key: string) {
    const entry = this.values.get(key);
    if (!entry) return undefined;
    if (entry.expiresAtMs <= this.nowMs) {
      this.values.delete(key);
      return undefined;
    }
    return entry;
  }

  async get(key: string): Promise<unknown> {
    return this.live(key)?.value ?? null;
  }

  async set(
    key: string,
    value: unknown,
    options: { ex: number } | { ex: number; nx: true },
  ): Promise<unknown> {
    const nx = "nx" in options && options.nx === true;
    this.setCalls.push({ key, nx });
    if (nx && this.live(key) !== undefined) return null;
    this.values.set(key, {
      value,
      expiresAtMs: this.nowMs + options.ex * 1_000,
    });
    return "OK";
  }

  async del(key: string): Promise<unknown> {
    this.values.delete(key);
    return 1;
  }
}

describe("turn claim: key scoping", () => {
  it("cannot collide across tenants even when a client reuses a request id", () => {
    // The memory key is already a hash of (tenant, visitor); the claim key
    // inherits that, so a shared request id is harmless.
    const requestId = "11111111-1111-4111-8111-111111111111";
    const tenantA = conversationMemoryKey("tenant-a", "anonymous:session-1");
    const tenantB = conversationMemoryKey("tenant-b", "anonymous:session-1");
    expect(conversationClaimKey(tenantA, requestId)).not.toBe(
      conversationClaimKey(tenantB, requestId),
    );
  });

  it("cannot collide across conversations of one tenant", () => {
    const requestId = "11111111-1111-4111-8111-111111111111";
    const first = conversationMemoryKey("tenant-a", "anonymous:session-1");
    const second = conversationMemoryKey("tenant-a", "anonymous:session-2");
    expect(conversationClaimKey(first, requestId)).not.toBe(
      conversationClaimKey(second, requestId),
    );
  });

  it("separates two turns of the same conversation", () => {
    const memoryKey = conversationMemoryKey("tenant-a", "visitor-1");
    expect(conversationClaimKey(memoryKey, "req-1")).not.toBe(
      conversationClaimKey(memoryKey, "req-2"),
    );
  });

  it("leaks neither the tenant nor the visitor", () => {
    const key = conversationClaimKey(
      conversationMemoryKey("tenant-secret", "visitor-secret"),
      "req-1",
    );
    expect(key).not.toContain("tenant-secret");
    expect(key).not.toContain("visitor-secret");
  });
});

describe("turn claim: shared store", () => {
  it("grants the first delivery and refuses a concurrent duplicate", async () => {
    const redis = new FakeRedis();
    const store = new UpstashConversationMemoryStore(redis, () => NOW);
    const key = "conv:turn:req-1";

    const first = await store.claim(key, TTL);
    const duplicate = await store.claim(key, TTL);

    expect(first).toEqual({ granted: true, scope: "shared" });
    expect(duplicate).toEqual({ granted: false, scope: "shared" });
  });

  it("takes the lease atomically rather than reading then writing", async () => {
    // A read-then-write lease is not a lease: two deliveries both read absent
    // and both proceed. NX is what makes it exclusive.
    const redis = new FakeRedis();
    const store = new UpstashConversationMemoryStore(redis, () => NOW);
    await store.claim("conv:turn:req-1", TTL);
    expect(redis.setCalls.at(-1)).toEqual({ key: "conv:turn:req-1", nx: true });
  });

  it("does not block a different turn of the same conversation", async () => {
    const redis = new FakeRedis();
    const store = new UpstashConversationMemoryStore(redis, () => NOW);
    await store.claim("conv:turn:req-1", TTL);
    await expect(store.claim("conv:turn:req-2", TTL)).resolves.toEqual({
      granted: true,
      scope: "shared",
    });
  });

  it("recovers after the lease expires, so a crash cannot wedge a conversation", async () => {
    const redis = new FakeRedis();
    const store = new UpstashConversationMemoryStore(redis, () => NOW);
    await store.claim("conv:turn:req-1", TTL);
    expect((await store.claim("conv:turn:req-1", TTL)).granted).toBe(false);

    redis.advance(TTL * 1_000 + 1);
    expect((await store.claim("conv:turn:req-1", TTL)).granted).toBe(true);
  });

  it("uses a window that outlives a slow two-call tool turn", () => {
    expect(CONVERSATION_CLAIM_TTL_SECONDS).toBeGreaterThanOrEqual(60);
    // ...but frees quickly enough that a wedged lease is not an outage.
    expect(CONVERSATION_CLAIM_TTL_SECONDS).toBeLessThanOrEqual(300);
  });
});

describe("turn claim: local store", () => {
  it("still excludes a duplicate on one instance", async () => {
    // The common double-submit lands on the same warm instance, so the local
    // lease is worth having even without Upstash.
    const store = new InMemoryConversationMemoryStore(() => NOW);
    expect((await store.claim("k", TTL)).granted).toBe(true);
    expect((await store.claim("k", TTL)).granted).toBe(false);
  });

  it("reports itself as local, never as distributed protection", async () => {
    const store = new InMemoryConversationMemoryStore(() => NOW);
    expect((await store.claim("k", TTL)).scope).toBe("local");
  });

  it("expires its lease too", async () => {
    let now = NOW;
    const store = new InMemoryConversationMemoryStore(() => now);
    await store.claim("k", TTL);
    now += TTL * 1_000 + 1;
    expect((await store.claim("k", TTL)).granted).toBe(true);
  });
});

describe("turn claim: degraded shared store", () => {
  const failing: ConversationMemoryStore = {
    get: () => Promise.reject(new Error("down")),
    append: () => Promise.reject(new Error("down")),
    delete: () => Promise.reject(new Error("down")),
    claim: () => Promise.reject(new Error("down")),
  };

  it("falls back to a local lease and says so", async () => {
    // Failing open into a claim of distributed idempotency would be worse
    // than having none: it would be believed.
    const store = new FallbackConversationMemoryStore(
      failing,
      new InMemoryConversationMemoryStore(() => NOW),
      () => {},
      () => NOW,
    );
    const result = await store.claim("k", TTL);
    expect(result.granted).toBe(true);
    expect(result.scope).toBe("local");
  });

  it("reports the degradation through the same signal as the other operations", async () => {
    const events: string[] = [];
    const store = new FallbackConversationMemoryStore(
      failing,
      new InMemoryConversationMemoryStore(() => NOW),
      ({ operation }) => events.push(operation),
      () => NOW,
    );
    await store.claim("k", TTL);
    expect(events).toContain("claim");
    expect(store.isDegraded()).toBe(true);
  });

  it("keeps chat working rather than refusing to answer", async () => {
    const store = new FallbackConversationMemoryStore(
      failing,
      new InMemoryConversationMemoryStore(() => NOW),
      () => {},
      () => NOW,
    );
    // Granted, so the turn proceeds: a cache problem must not become an outage.
    expect((await store.claim("k", TTL)).granted).toBe(true);
  });
});

describe("memory mode signal", () => {
  it("names the mode and nothing else", async () => {
    // The signal is exposed on an unauthenticated readiness probe, so the
    // safety property is that it can only ever be one of three words.
    const { conversationMemoryMode, resetConversationMemoryStoreForTests } =
      await import("./conversationMemory.server");
    resetConversationMemoryStoreForTests();
    const mode = conversationMemoryMode();
    expect(["shared", "degraded", "local"]).toContain(mode);
  });

  it("reports local when no shared store is configured", async () => {
    // The shape every LUME environment actually runs as of 2026-09-16.
    const { conversationMemoryMode, resetConversationMemoryStoreForTests } =
      await import("./conversationMemory.server");
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    resetConversationMemoryStoreForTests();
    try {
      expect(conversationMemoryMode()).toBe("local");
    } finally {
      if (url !== undefined) process.env.UPSTASH_REDIS_REST_URL = url;
      if (token !== undefined) process.env.UPSTASH_REDIS_REST_TOKEN = token;
      resetConversationMemoryStoreForTests();
    }
  });
});
