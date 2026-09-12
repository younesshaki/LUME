import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import {
  appendConversationMemory,
  CONVERSATION_MEMORY_TTL_SECONDS,
  ConversationMemoryConflictError,
  FallbackConversationMemoryStore,
  InMemoryConversationMemoryStore,
  isDuplicateMemoryUpdate,
  normalizeConversationMemory,
  type ConversationMemorySnapshot,
  type ConversationMemoryStore,
  type ConversationMemoryUpdate,
} from "@lume/bot";
import { captureError } from "./observability";

type RedisMemoryClient = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, options: { ex: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
  /**
   * Optional: present on @upstash/redis, absent on the minimal fakes used in
   * tests of the non-CAS path. Feature-detected, never assumed.
   */
  eval?(script: string, keys: string[], args: string[]): Promise<unknown>;
};

/**
 * Commit only if the stored snapshot is still the one we read.
 *
 * Returns -1 on commit, otherwise the stateVersion that is actually stored so
 * the caller can re-read and retry. Written as one script because the REST
 * protocol has no MULTI/WATCH: without it, two turns of the same conversation
 * arriving together both read version N, both write N+1, and the first turn's
 * state is lost.
 */
const CAS_SCRIPT = `
local stored = redis.call('GET', KEYS[1])
local currentVersion = 0
if stored then
  local ok, decoded = pcall(cjson.decode, stored)
  if ok and type(decoded) == 'table' and decoded['stateVersion'] then
    currentVersion = tonumber(decoded['stateVersion']) or 0
  end
end
if currentVersion ~= tonumber(ARGV[2]) then
  return currentVersion
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[3]))
return -1
`;

/** How many times a losing writer re-reads before giving up. */
const MAX_CAS_ATTEMPTS = 3;

export class UpstashConversationMemoryStore implements ConversationMemoryStore {
  constructor(
    private readonly redis: RedisMemoryClient,
    private readonly now: () => number = Date.now,
  ) {}

  async get(key: string): Promise<ConversationMemorySnapshot | null> {
    const value = await this.redis.get(key);
    if (value === null) return null;
    const snapshot = normalizeConversationMemory(value);
    return Date.parse(snapshot.expiresAt) > this.now() ? snapshot : null;
  }

  async append(key: string, update: ConversationMemoryUpdate): Promise<ConversationMemorySnapshot> {
    const evaluate = this.redis.eval?.bind(this.redis);
    if (!evaluate) {
      // No scripting on this client: the historical unguarded read-modify-write.
      // Still correct for a single concurrent writer, which is the common case.
      const next = appendConversationMemory(await this.get(key), update, this.now());
      await this.redis.set(key, next, { ex: CONVERSATION_MEMORY_TTL_SECONDS });
      return next;
    }

    let lastObservedVersion = 0;
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      const current = await this.get(key);
      // A retry of an already-committed turn is answered from the stored
      // snapshot rather than appended again.
      if (current && isDuplicateMemoryUpdate(current, update)) return current;
      const next = appendConversationMemory(current, update, this.now());
      const observedVersion = current?.stateVersion ?? 0;
      const outcome = await evaluate(
        CAS_SCRIPT,
        [key],
        [
          JSON.stringify(next),
          String(observedVersion),
          String(CONVERSATION_MEMORY_TTL_SECONDS),
        ],
      );
      if (Number(outcome) === -1) return next;
      lastObservedVersion = Number(outcome);
      // Someone else committed in between. If the caller pinned a version,
      // its turn is genuinely stale and must not retry into a newer state.
      if (update.expectedStateVersion !== undefined) {
        throw new ConversationMemoryConflictError(
          update.expectedStateVersion,
          lastObservedVersion,
        );
      }
    }
    throw new ConversationMemoryConflictError(-1, lastObservedVersion);
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }
}

const fallback = new InMemoryConversationMemoryStore();
let configuredStore: ConversationMemoryStore | null = null;

export function getConversationMemoryStore(): ConversationMemoryStore {
  if (configuredStore) return configuredStore;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    configuredStore = fallback;
    return configuredStore;
  }
  const primary = new UpstashConversationMemoryStore(new Redis({ url, token }));
  // A shared-store outage silently demotes the conversation to per-instance
  // memory, which on a multi-instance deployment means each instance answers
  // from a different conversation. That must be visible, not inferred later
  // from confused transcripts.
  configuredStore = new FallbackConversationMemoryStore(
    primary,
    fallback,
    ({ operation, error }) => {
      captureError("api/chat/memory-degraded", error, { operation });
    },
  );
  return configuredStore;
}

/**
 * True when the process is answering from per-instance memory because the
 * shared store failed. Continuity is not guaranteed in that mode.
 */
export function isConversationMemoryDegraded(): boolean {
  return configuredStore instanceof FallbackConversationMemoryStore
    ? configuredStore.isDegraded()
    : false;
}

/** Test hook: drop the cached store so env changes take effect. */
export function resetConversationMemoryStoreForTests(): void {
  configuredStore = null;
}

export function conversationMemoryKey(tenantId: string, visitorId: string): string {
  const digest = createHash("sha256").update(`${tenantId}\0${visitorId}`).digest("hex");
  return `lume:conversation:v1:${digest}`;
}

/**
 * Admin state must never share a namespace with public visitor chat. The
 * authenticated actor and a browser-generated session are both part of the
 * opaque key, so two tabs/users cannot inherit each other's result set.
 */
export function adminConversationMemoryKey(
  tenantId: string,
  actorUserId: string,
  sessionId: string,
): string {
  const digest = createHash("sha256")
    .update(`${tenantId}\0${actorUserId}\0${sessionId}`)
    .digest("hex");
  return `lume:admin-conversation:v1:${digest}`;
}
