import { describe, expect, it, vi } from "vitest";
import {
  appendConversationMemory,
  ConversationMemoryConflictError,
  CONVERSATION_MEMORY_SCHEMA_VERSION,
  FallbackConversationMemoryStore,
  InMemoryConversationMemoryStore,
  isDuplicateMemoryUpdate,
  normalizeConversationMemory,
  type ConversationMemorySnapshot,
  type ConversationMemoryStore,
  type ConversationMemoryUpdate,
} from "./conversationMemory";

const at = (iso: string) => Date.parse(iso);
const NOW = at("2026-09-12T10:00:00.000Z");

describe("conversation memory: schema versioning", () => {
  it("stamps the current envelope version on every write", () => {
    const snapshot = appendConversationMemory(
      null,
      { messages: [{ role: "user", content: "hi" }] },
      NOW,
    );
    expect(snapshot.schemaVersion).toBe(CONVERSATION_MEMORY_SCHEMA_VERSION);
    expect(snapshot.stateVersion).toBe(1);
  });

  it("reads pre-versioning snapshots unchanged", () => {
    // Data written before versioning existed has an identical envelope, so it
    // must keep working rather than being discarded on deploy.
    const legacy = normalizeConversationMemory({
      messages: [{ role: "user", content: "legacy" }],
      toolResults: [],
      conversationState: { activeFilters: { make: "BMW" } },
      expiresAt: new Date(NOW + 1000).toISOString(),
    });
    expect(legacy.messages).toHaveLength(1);
    expect(legacy.conversationState).toEqual({ activeFilters: { make: "BMW" } });
    expect(legacy.stateVersion).toBe(0);
  });

  it("refuses to interpret state written by a newer deployment", () => {
    // The forward-compatibility rule. A future conversationState may mean
    // something this build does not understand; guessing is how a stale scope
    // gets resurrected. Messages survive (untrusted display text either way).
    const future = normalizeConversationMemory({
      schemaVersion: CONVERSATION_MEMORY_SCHEMA_VERSION + 1,
      stateVersion: 9,
      messages: [{ role: "user", content: "from the future" }],
      toolResults: [],
      conversationState: { somethingNew: true },
      expiresAt: new Date(NOW + 1000).toISOString(),
    });
    expect(future.conversationState).toBeUndefined();
    expect(future.messages).toHaveLength(1);
  });

  it("treats a corrupt stateVersion as zero rather than trusting it", () => {
    const corrupt = normalizeConversationMemory({
      stateVersion: "not-a-number",
      messages: [],
      toolResults: [],
      expiresAt: new Date(NOW + 1000).toISOString(),
    });
    expect(corrupt.stateVersion).toBe(0);
  });
});

describe("conversation memory: duplicate turns", () => {
  it("does not append the same request twice", async () => {
    // A client reconnect replays the request. Without dedupe the visitor's
    // message and the reply land in history twice, and the model then sees a
    // conversation where the visitor repeated themselves.
    const store = new InMemoryConversationMemoryStore(() => NOW);
    const update: ConversationMemoryUpdate = {
      requestId: "req-1",
      messages: [
        { role: "user", content: "any BMWs?" },
        { role: "assistant", content: "Nine." },
      ],
    };
    await store.append("k", update);
    const second = await store.append("k", update);
    expect(second.messages).toHaveLength(2);
    expect(second.stateVersion).toBe(1);
  });

  it("still advances for a genuinely new turn", async () => {
    const store = new InMemoryConversationMemoryStore(() => NOW);
    await store.append("k", {
      requestId: "req-1",
      messages: [{ role: "user", content: "one" }],
    });
    const second = await store.append("k", {
      requestId: "req-2",
      messages: [{ role: "user", content: "two" }],
    });
    expect(second.messages).toHaveLength(2);
    expect(second.stateVersion).toBe(2);
  });

  it("identifies a duplicate only when the stored turn matches", () => {
    const current = appendConversationMemory(null, { requestId: "a" }, NOW);
    expect(isDuplicateMemoryUpdate(current, { requestId: "a" })).toBe(true);
    expect(isDuplicateMemoryUpdate(current, { requestId: "b" })).toBe(false);
    expect(isDuplicateMemoryUpdate(current, {})).toBe(false);
    expect(isDuplicateMemoryUpdate(null, { requestId: "a" })).toBe(false);
  });
});

describe("conversation memory: out-of-order turns", () => {
  it("rejects a write whose turn read an older state", async () => {
    // Turn N is slow; turn N+1 commits first. N must not overwrite it with
    // the scope the visitor has already moved on from.
    const store = new InMemoryConversationMemoryStore(() => NOW);
    await store.append("k", {
      messages: [{ role: "user", content: "first" }],
    });
    await expect(
      store.append("k", {
        expectedStateVersion: 0,
        conversationState: { stale: true },
      }),
    ).rejects.toBeInstanceOf(ConversationMemoryConflictError);
  });

  it("accepts a write that pinned the current state", async () => {
    const store = new InMemoryConversationMemoryStore(() => NOW);
    const first = await store.append("k", {
      messages: [{ role: "user", content: "first" }],
    });
    const second = await store.append("k", {
      expectedStateVersion: first.stateVersion,
      conversationState: { fresh: true },
    });
    expect(second.conversationState).toEqual({ fresh: true });
    expect(second.stateVersion).toBe(2);
  });

  it("leaves unpinned writers on the previous last-write-wins behaviour", async () => {
    // Pinning is opt-in so existing callers keep working during rollout.
    const store = new InMemoryConversationMemoryStore(() => NOW);
    await store.append("k", { conversationState: { a: 1 } });
    const second = await store.append("k", { conversationState: { a: 2 } });
    expect(second.conversationState).toEqual({ a: 2 });
  });
});

describe("conversation memory: degraded shared store", () => {
  const failing: ConversationMemoryStore = {
    get: () => Promise.reject(new Error("upstream down")),
    append: () => Promise.reject(new Error("upstream down")),
    delete: () => Promise.reject(new Error("upstream down")),
  };

  it("reports every degradation instead of silently downgrading", async () => {
    const onDegraded = vi.fn();
    const store = new FallbackConversationMemoryStore(
      failing,
      new InMemoryConversationMemoryStore(() => NOW),
      onDegraded,
      () => NOW,
    );
    expect(store.isDegraded()).toBe(false);
    await store.get("k");
    expect(onDegraded).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "get" }),
    );
    expect(store.isDegraded()).toBe(true);
  });

  it("keeps serving from the local store so chat does not go down", async () => {
    const store = new FallbackConversationMemoryStore(
      failing,
      new InMemoryConversationMemoryStore(() => NOW),
      () => {},
      () => NOW,
    );
    const written = await store.append("k", {
      messages: [{ role: "user", content: "still works" }],
    });
    expect(written.messages).toHaveLength(1);
    expect(store.isDegraded()).toBe(true);
  });

  it("clears the degraded flag once the shared store answers again", async () => {
    let healthy = false;
    const flaky: ConversationMemoryStore = {
      get: async () => {
        if (!healthy) throw new Error("down");
        return null;
      },
      append: async (_key, update) => appendConversationMemory(null, update, NOW),
      delete: async () => {},
    };
    const store = new FallbackConversationMemoryStore(
      flaky,
      new InMemoryConversationMemoryStore(() => NOW),
      () => {},
      () => NOW,
    );
    await store.get("k");
    expect(store.isDegraded()).toBe(true);
    healthy = true;
    await store.get("k");
    expect(store.isDegraded()).toBe(false);
  });

  it("surfaces a conflict rather than treating it as an outage", async () => {
    // A rejected stale write is a healthy store saying no. Swallowing it into
    // the fallback would hide exactly the race this contract exists to catch.
    const conflicting: ConversationMemoryStore = {
      get: async () => null,
      append: () => Promise.reject(new ConversationMemoryConflictError(1, 2)),
      delete: async () => {},
    };
    const onDegraded = vi.fn();
    const store = new FallbackConversationMemoryStore(
      conflicting,
      new InMemoryConversationMemoryStore(() => NOW),
      onDegraded,
      () => NOW,
    );
    await expect(
      store.append("k", { expectedStateVersion: 1 }),
    ).rejects.toBeInstanceOf(ConversationMemoryConflictError);
    expect(onDegraded).not.toHaveBeenCalled();
    expect(store.isDegraded()).toBe(false);
  });
});

describe("conversation memory: snapshot hygiene is unchanged", () => {
  it("still bounds history and refreshes the TTL", () => {
    let snapshot: ConversationMemorySnapshot | null = null;
    for (let i = 0; i < 30; i += 1) {
      snapshot = appendConversationMemory(
        snapshot,
        { messages: [{ role: "user", content: `m${i}` }] },
        NOW,
      );
    }
    expect(snapshot!.messages).toHaveLength(20);
    expect(snapshot!.messages[0]!.content).toBe("m10");
    expect(Date.parse(snapshot!.expiresAt)).toBeGreaterThan(NOW);
  });
});

describe("conversation memory: retry-safe idempotency end to end", () => {
  it("treats a redelivered turn as one turn, not two", async () => {
    // The retry case the client id exists for: the same turn delivered twice
    // (network retry, proxy replay) must not appear as the visitor asking
    // twice, which would also re-run the state transition.
    const store = new InMemoryConversationMemoryStore(() => NOW);
    const turn: ConversationMemoryUpdate = {
      requestId: "client-turn-1",
      messages: [
        { role: "user", content: "any BMWs under 40k?" },
        { role: "assistant", content: "Two." },
      ],
      conversationState: { activeFilters: { make: "BMW", priceMax: 40_000 } },
    };

    await store.append("k", turn);
    await store.append("k", turn);
    const snapshot = await store.get("k");

    expect(snapshot?.messages).toHaveLength(2);
    expect(snapshot?.stateVersion).toBe(1);
    expect(snapshot?.conversationState).toEqual({
      activeFilters: { make: "BMW", priceMax: 40_000 },
    });
  });

  it("does not collapse two genuinely identical messages into one", () => {
    // "same text" is not "same turn". A visitor who repeats themselves is
    // having a second turn and must be recorded as such.
    const first = appendConversationMemory(
      null,
      { requestId: "turn-1", messages: [{ role: "user", content: "show me" }] },
      NOW,
    );
    const second = appendConversationMemory(
      first,
      { requestId: "turn-2", messages: [{ role: "user", content: "show me" }] },
      NOW,
    );
    expect(second.messages).toHaveLength(2);
    expect(second.stateVersion).toBe(2);
  });

  it("falls back to append-always when no turn id is supplied", () => {
    // Older or non-browser callers keep their previous behaviour rather than
    // being silently deduplicated on message content.
    const first = appendConversationMemory(
      null,
      { messages: [{ role: "user", content: "hi" }] },
      NOW,
    );
    const second = appendConversationMemory(
      first,
      { messages: [{ role: "user", content: "hi" }] },
      NOW,
    );
    expect(second.messages).toHaveLength(2);
  });

  it("keeps a redelivered turn from advancing state under CAS too", async () => {
    // Same guarantee on the pinned-version path: the retry is a no-op, so it
    // must not be reported as a conflict either.
    const store = new InMemoryConversationMemoryStore(() => NOW);
    const turn: ConversationMemoryUpdate = {
      requestId: "client-turn-9",
      expectedStateVersion: 0,
      messages: [{ role: "user", content: "hello" }],
    };
    await store.append("k", turn);
    const replayed = await store.append("k", turn);
    expect(replayed.stateVersion).toBe(1);
    expect(replayed.messages).toHaveLength(1);
  });
});
