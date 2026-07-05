/**
 * Best-effort in-memory rate limiting (SCRUM-112).
 *
 * Sliding-window counter per key. In-memory by design for the first pass:
 * with Fluid Compute reusing function instances this catches the abuse that
 * matters (one client hammering one warm instance); a shared store (Redis /
 * Upstash) is the documented upgrade path when limits must be exact across
 * instances. Fails open — a limiter bug must never take chat down.
 */

export type RateLimitResult = {
  allowed: boolean;
  /** Seconds until the oldest counted request leaves the window. */
  retryAfterSeconds: number;
  remaining: number;
};

type RateLimitOptions = {
  limit: number;
  windowMs: number;
  now?: () => number;
};

/** Per-key timestamps of requests inside the current window. */
const buckets = new Map<string, number[]>();

/** Cap tracked keys so a spray of unique IPs can't grow memory unbounded. */
const MAX_TRACKED_KEYS = 10_000;

export function checkRateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = (opts.now ?? Date.now)();
  const windowStart = now - opts.windowMs;

  let hits = buckets.get(key);
  if (!hits) {
    if (buckets.size >= MAX_TRACKED_KEYS) pruneExpired(windowStart);
    hits = [];
    buckets.set(key, hits);
  }

  // Drop timestamps that slid out of the window.
  while (hits.length > 0 && hits[0] <= windowStart) hits.shift();

  if (hits.length >= opts.limit) {
    const retryAfterMs = hits[0] + opts.windowMs - now;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      remaining: 0,
    };
  }

  hits.push(now);
  return {
    allowed: true,
    retryAfterSeconds: 0,
    remaining: opts.limit - hits.length,
  };
}

function pruneExpired(windowStart: number): void {
  for (const [key, hits] of buckets) {
    if (hits.length === 0 || hits[hits.length - 1] <= windowStart) {
      buckets.delete(key);
    }
  }
}

/** Test hook: clear all buckets. */
export function resetRateLimits(): void {
  buckets.clear();
}

const CHAT_LIMIT = 10;
const CHAT_WINDOW_MS = 60_000;

/** SCRUM-112 policy: 10 chat requests per minute per client. */
export function checkChatRateLimit(key: string, now?: () => number): RateLimitResult {
  return checkRateLimit(`chat:${key}`, { limit: CHAT_LIMIT, windowMs: CHAT_WINDOW_MS, now });
}

/**
 * Client IP for rate-limit keying. First x-forwarded-for hop (Vercel sets
 * it; the public-site chat proxy forwards it through), then x-real-ip.
 * Best-effort — spoofable in principle, good enough for abuse throttling.
 */
export function clientIpFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
