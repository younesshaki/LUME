import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import {
  appendConversationMemory,
  CONVERSATION_CLAIM_TTL_SECONDS,
  CONVERSATION_MEMORY_TTL_SECONDS,
  ConversationMemoryConflictError,
  FallbackConversationMemoryStore,
  InMemoryConversationMemoryStore,
  isDuplicateMemoryUpdate,
  normalizeConversationMemory,
  type ConversationClaimResult,
  type ConversationMemorySnapshot,
  type ConversationMemoryStore,
  type ConversationMemoryUpdate,
} from "@lume/bot";
import { captureError } from "./observability";

type RedisMemoryClient = {
  get(key: string): Promise<unknown>;
  /**
   * `nx` makes the write conditional on the key not existing, which is what
   * turns a claim into an atomic lease rather than a read-then-write race.
   * Upstash returns "OK" when it wrote and null when it did not.
   */
  set(
    key: string,
    value: unknown,
    options: { ex: number } | { ex: number; nx: true },
  ): Promise<unknown>;
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

  async claim(
    key: string,
    ttlSeconds: number,
  ): Promise<ConversationClaimResult> {
    // SET key value EX ttl NX — one round trip, atomic across instances. The
    // stored value is a constant: the key's existence is the whole signal, and
    // putting anything about the turn in it would be data we do not need.
    const written = await this.redis.set(key, "1", { ex: ttlSeconds, nx: true });
    return { granted: written !== null && written !== undefined, scope: "shared" };
  }
}

const fallback = new InMemoryConversationMemoryStore();
let configuredStore: ConversationMemoryStore | null = null;

export function getConversationMemoryStore(): ConversationMemoryStore {
  if (configuredStore) return configuredStore;
  // Vercel's Upstash Marketplace integration injects KV_REST_API_* while a
  // directly managed Upstash database conventionally uses UPSTASH_REDIS_*.
  // Supporting both keeps the storage adapter provider-neutral and avoids
  // copying credentials between environment-variable names.
  const url = firstConfiguredEnv("UPSTASH_REDIS_REST_URL", "KV_REST_API_URL");
  const token = firstConfiguredEnv("UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN");
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

function firstConfiguredEnv(...names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

/**
 * How this process is storing conversation state, as a non-secret signal.
 *
 * - `shared`   — a shared store is configured and currently answering.
 * - `degraded` — a shared store is configured but failing; this process is
 *                serving from per-instance memory and continuity across
 *                instances is not guaranteed.
 * - `local`    — no shared store is configured. Legitimate for a single
 *                instance, but the duplicate-turn lease and the
 *                compare-and-set writes then protect only within this process.
 *
 * Deliberately reports the MODE and never a URL, token or host, so it is safe
 * to expose on an unauthenticated probe.
 */
export type ConversationMemoryMode = "shared" | "degraded" | "local";

export function conversationMemoryMode(): ConversationMemoryMode {
  const store = getConversationMemoryStore();
  if (!(store instanceof FallbackConversationMemoryStore)) return "local";
  return store.isDegraded() ? "degraded" : "shared";
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

/**
 * Lease key for one delivery of one turn.
 *
 * Built from the conversation memory key, which is already a SHA-256 of
 * (tenant, visitor), so two tenants cannot collide even if a client reuses a
 * request id. Both halves are opaque.
 */
export function conversationClaimKey(
  memoryKey: string,
  requestId: string,
): string {
  return `${memoryKey}:turn:${requestId}`;
}

/**
 * Try to become the one delivery of this turn that does the work.
 *
 * Returns `granted:false` only when another delivery of the SAME turn already
 * holds the lease. Any store failure grants rather than blocks: refusing to
 * answer a visitor because a lease could not be written would turn a cache
 * problem into an outage.
 */
export async function claimConversationTurn(
  memoryKey: string,
  requestId: string,
): Promise<ConversationClaimResult> {
  try {
    return await getConversationMemoryStore().claim(
      conversationClaimKey(memoryKey, requestId),
      CONVERSATION_CLAIM_TTL_SECONDS,
    );
  } catch {
    return { granted: true, scope: "local" };
  }
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
