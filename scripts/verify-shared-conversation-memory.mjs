#!/usr/bin/env node
/**
 * Prove the shared conversation-memory protocol against a REAL Upstash
 * instance — the one thing the unit suite cannot do.
 *
 * Everything in `conversationTurnClaim.test.ts` and `conversationMemoryCas.test.ts`
 * runs against a simulator that implements what we *believe* Upstash does.
 * That is enough to prove our logic and nothing about theirs: whether `SET NX`
 * is honoured, whether `EX` expires when we think, whether a Lua script is
 * even permitted on the plan. This script answers those, and only those.
 *
 * It is opt-in and refuses to run anywhere it might touch real conversations:
 *
 *   VERIFY_SHARED_MEMORY=1 \
 *   VERIFY_UPSTASH_REDIS_REST_URL=... \
 *   VERIFY_UPSTASH_REDIS_REST_TOKEN=... \
 *   node scripts/verify-shared-conversation-memory.mjs
 *
 * The credentials are read from VERIFY_-prefixed variables on purpose. The
 * ordinary UPSTASH_REDIS_REST_* pair is deliberately NOT accepted: a developer
 * with production credentials already exported should not be able to point
 * this at production by forgetting a flag.
 *
 * Safety properties, all enforced below rather than documented and hoped for:
 *   - every key is written under one run-scoped prefix containing a UUID;
 *   - only keys this run created are deleted, by exact name, tracked in a set;
 *   - no SCAN, KEYS, FLUSHDB or pattern delete is ever issued;
 *   - no conversation text, tenant id, visitor id or lead data is written —
 *     values are the literal string "1" and small synthetic snapshots;
 *   - credentials are never printed, and the host is shown only as a redacted
 *     suffix so you can tell two instances apart without exposing either.
 */
import { randomUUID } from "node:crypto";

const PREFIX = `lume:verify:shared-memory:${randomUUID()}`;
const CLAIM_TTL_SECONDS = 5;
const created = new Set();

function fail(message) {
  console.error(`[verify-shared-memory] ${message}`);
  process.exit(1);
}

if (process.env.VERIFY_SHARED_MEMORY !== "1") {
  fail(
    "refusing to run without VERIFY_SHARED_MEMORY=1 — this script writes to a real Redis",
  );
}

const url = process.env.VERIFY_UPSTASH_REDIS_REST_URL?.trim();
const token = process.env.VERIFY_UPSTASH_REDIS_REST_TOKEN?.trim();
if (!url || !token) {
  fail(
    "set VERIFY_UPSTASH_REDIS_REST_URL and VERIFY_UPSTASH_REDIS_REST_TOKEN (deliberately not the UPSTASH_* pair, so an exported production credential cannot be used by accident)",
  );
}
if (
  process.env.UPSTASH_REDIS_REST_URL?.trim() &&
  process.env.UPSTASH_REDIS_REST_URL.trim() === url
) {
  fail(
    "the supplied URL matches this environment's configured UPSTASH_REDIS_REST_URL — point this at a disposable preview instance, never the one serving real conversations",
  );
}

/** Enough of the host to distinguish two instances; never enough to use one. */
function redactedTarget(rawUrl) {
  try {
    const host = new URL(rawUrl).host;
    return `…${host.slice(-12)}`;
  } catch {
    return "…(unparseable)";
  }
}

async function command(args) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!response.ok) {
    // The body can echo the command but never the token, which lives in the
    // header. Still truncated, because an error body is not a place to trust.
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    throw new Error(`Redis command failed: ${response.status} ${detail}`);
  }
  const payload = await response.json();
  if (payload.error) throw new Error(`Redis error: ${String(payload.error).slice(0, 200)}`);
  return payload.result;
}

function key(name) {
  const full = `${PREFIX}:${name}`;
  created.add(full);
  return full;
}

const results = [];
function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  console.log(`[verify-shared-memory] target ${redactedTarget(url)}`);
  console.log(`[verify-shared-memory] run prefix ${PREFIX}`);

  // 1-3. The turn lease: SET NX EX must be exclusive.
  const claimA = key("claim:turn-a");
  const first = await command(["SET", claimA, "1", "EX", String(CLAIM_TTL_SECONDS), "NX"]);
  check("first claim is granted", first === "OK", `got ${JSON.stringify(first)}`);

  const duplicate = await command(["SET", claimA, "1", "EX", String(CLAIM_TTL_SECONDS), "NX"]);
  check(
    "concurrent duplicate claim is refused",
    duplicate === null,
    `got ${JSON.stringify(duplicate)}`,
  );

  // 4. A different conversation's turn must be unaffected.
  const claimB = key("claim:turn-b");
  const other = await command(["SET", claimB, "1", "EX", String(CLAIM_TTL_SECONDS), "NX"]);
  check("a different conversation key is unaffected", other === "OK");

  // 5. The lease must actually expire, or a crash wedges a conversation.
  await sleep((CLAIM_TTL_SECONDS + 1) * 1000);
  const afterExpiry = await command(["SET", claimA, "1", "EX", String(CLAIM_TTL_SECONDS), "NX"]);
  check(
    "claim is reclaimable after the TTL expires",
    afterExpiry === "OK",
    `waited ${CLAIM_TTL_SECONDS + 1}s`,
  );

  // 6-7. Compare-and-set: the exact script the store ships.
  const casScript = `
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
  const stateKey = key("state");
  const snapshot = (version) =>
    JSON.stringify({ schemaVersion: 1, stateVersion: version, messages: [], toolResults: [] });

  const committed = await command([
    "EVAL", casScript, "1", stateKey, snapshot(1), "0", "60",
  ]);
  check("compare-and-set commits at the expected version", Number(committed) === -1);

  const stale = await command([
    "EVAL", casScript, "1", stateKey, snapshot(2), "0", "60",
  ]);
  check(
    "compare-and-set rejects a stale expected version",
    Number(stale) === 1,
    `store reported version ${stale}`,
  );

  const next = await command([
    "EVAL", casScript, "1", stateKey, snapshot(2), "1", "60",
  ]);
  check("compare-and-set commits once the version is current", Number(next) === -1);

  // 8. Idempotency is a property of the snapshot, so read it back.
  const stored = await command(["GET", stateKey]);
  const parsed = typeof stored === "string" ? JSON.parse(stored) : stored;
  check(
    "the committed snapshot is the one we wrote",
    parsed?.stateVersion === 2,
    `stateVersion ${parsed?.stateVersion}`,
  );

  // 9. Degraded behaviour: a bad token must fail loudly, not silently pass.
  const badTokenResponse = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer invalid-token-for-degradation-check",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(["GET", key("unreachable")]),
  }).catch(() => null);
  check(
    "an unusable credential surfaces as a failure",
    !badTokenResponse || !badTokenResponse.ok,
    badTokenResponse ? `status ${badTokenResponse.status}` : "request rejected",
  );
}

async function cleanup() {
  // Only the exact keys this run created, by name. No pattern, no scan.
  let removed = 0;
  for (const name of created) {
    try {
      await command(["DEL", name]);
      removed += 1;
    } catch {
      console.warn(`[verify-shared-memory] could not delete ${name}; it expires on its own`);
    }
  }
  console.log(`[verify-shared-memory] cleaned up ${removed}/${created.size} run-scoped keys`);
}

try {
  await run();
} catch (error) {
  console.error(
    `[verify-shared-memory] aborted: ${error instanceof Error ? error.message : "unknown error"}`,
  );
  results.push({ name: "harness completed", passed: false });
} finally {
  await cleanup();
}

const failed = results.filter((result) => !result.passed);
console.log(
  `[verify-shared-memory] ${results.length - failed.length}/${results.length} checks passed`,
);
process.exit(failed.length === 0 ? 0 : 1);
