import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import {
  appendConversationMemory,
  CONVERSATION_MEMORY_TTL_SECONDS,
  FallbackConversationMemoryStore,
  InMemoryConversationMemoryStore,
  normalizeConversationMemory,
  type ConversationMemorySnapshot,
  type ConversationMemoryStore,
  type ConversationMemoryUpdate,
} from "@lume/bot";

type RedisMemoryClient = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, options: { ex: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
};

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
    const next = appendConversationMemory(await this.get(key), update, this.now());
    await this.redis.set(key, next, { ex: CONVERSATION_MEMORY_TTL_SECONDS });
    return next;
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
  configuredStore = new FallbackConversationMemoryStore(primary, fallback);
  return configuredStore;
}

export function conversationMemoryKey(tenantId: string, visitorId: string): string {
  const digest = createHash("sha256").update(`${tenantId}\0${visitorId}`).digest("hex");
  return `lume:conversation:v1:${digest}`;
}
