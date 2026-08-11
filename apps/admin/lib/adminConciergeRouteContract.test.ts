import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  resolve(process.cwd(), "apps/admin/app/api/admin/concierge/route.ts"),
  "utf8",
);

/**
 * Ordering contract for the admin concierge handler.
 *
 * These assertions are about *where* calls sit relative to each other, which
 * is the only thing that distinguishes the fixed handler from the broken one —
 * a unit test on any extracted helper would pass in both. Read the offsets as
 * "this gate runs before that work", nothing more.
 */
/** The call site, not the import — both contain the function name. */
const LIMITER_CALL = "checkChatRateLimit(`admin:";

describe("admin concierge route ordering", () => {
  const at = (needle: string) => {
    const index = route.indexOf(needle);
    expect(index, `expected to find ${needle} in the route`).toBeGreaterThan(-1);
    return index;
  };

  it("rate limits after authorization but before any request work", () => {
    // Authorization first: an unauthorized caller must not be able to burn
    // through a real member's budget just by naming their tenant.
    expect(at("Not authorized for this tenant.")).toBeLessThan(at(LIMITER_CALL));

    // Then the limiter, ahead of every branch that costs a query. The stored
    // presentation path returns early, and the deterministic inspections page
    // whole tables, so both must sit downstream of the gate.
    expect(at(LIMITER_CALL)).toBeLessThan(at("resolveAdminPresentationRequest(parsed.request.message"));
    expect(at(LIMITER_CALL)).toBeLessThan(at("compileDeterministicAdminIntent(parsed.request.message"));
  });

  it("keeps exactly one limiter call, so no branch can be unmetered", () => {
    // The original bug was a second call nested inside the model fallback,
    // which left every deterministic path unlimited. One call, above the
    // branch point, is the invariant.
    expect(route.match(/checkChatRateLimit\(/g)).toHaveLength(1);
  });

  it("still answers a throttled request with 429 and Retry-After", () => {
    const limiterBlock = route.slice(at(LIMITER_CALL), at(LIMITER_CALL) + 500);
    expect(limiterBlock).toContain("status: 429");
    expect(limiterBlock).toContain('"Retry-After": String(rate.retryAfterSeconds)');
  });
});
