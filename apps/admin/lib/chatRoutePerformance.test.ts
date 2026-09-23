// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { recordConciergeTurn } from "./observability";
import { settle, unwrapSettled } from "./settled";

const route = readFileSync(
  resolve(process.cwd(), "apps/admin/app/api/chat/route.ts"),
  "utf8",
);

/**
 * Performance contracts for the public concierge handler.
 *
 * Source-ordering assertions, for the reason chatRouteContext.test.ts gives:
 * the root vitest config cannot import this Next.js route. What these pin is
 * that the latency work (reads overlapped instead of chained) did not move
 * any decision: the quota still gates the answer, a failed read still fails
 * the turn where it did, and the model-only context stays off the
 * deterministic path. The measured effect lives in apps/admin/bench.
 */
const at = (needle: string, from = 0) => {
  const index = route.indexOf(needle, from);
  expect(index, `expected to find ${needle} in the route`).toBeGreaterThan(-1);
  return index;
};

const QUOTA_AWAIT = "const quota = await checkPublicApiQuota(";
const QUOTA_REFUSAL = "if (!quota.allowed) {";
const FACETS_START = 'supabase.rpc("vehicle_facets_v2"';
const CONFIG_START = "const tenantConfigRead = settle(";
const CONFIG_UNWRAP = "await unwrapSettled(tenantConfigRead)";
const FACETS_UNWRAP = "unwrapSettled(facetRead)";
const STATE_TRY = "// Only the reads a deterministic rule can actually need happen here.";
const STATE_FAILURE = 'captureError("api/chat/state-build"';
const DETERMINISTIC_RETURN = "return new Response(stream, { headers: sseHeaders });";

describe("public chat route: overlapped reads keep the same decisions", () => {
  it("starts the tenant-only reads before waiting on the quota", () => {
    expect(at(FACETS_START)).toBeLessThan(at(QUOTA_AWAIT));
    expect(at(CONFIG_START)).toBeLessThan(at(QUOTA_AWAIT));
  });

  it("still refuses on quota before any read result is used", () => {
    // A refused turn must answer 429 exactly as before, whatever the
    // overlapped reads returned — including if one of them failed.
    expect(at(QUOTA_REFUSAL)).toBeLessThan(at(CONFIG_UNWRAP));
    expect(at(QUOTA_REFUSAL)).toBeLessThan(at(FACETS_UNWRAP));
  });

  it("surfaces a failed facet read inside the state-build guard, as before", () => {
    // The facet read used to be awaited inside this try; its failure must
    // still become the same "Failed to build context" 500, not escape it.
    const unwrap = at(FACETS_UNWRAP);
    expect(unwrap).toBeGreaterThan(at(STATE_TRY));
    expect(unwrap).toBeLessThan(at(STATE_FAILURE));
  });

  it("reuses the early vehicle read only for the exact candidate it read", () => {
    expect(route).toContain("selectedVehicleCandidate === earlySelectedVehicleId");
    // The early read follows the same precedence rules as the candidate: the
    // open page, unless the visitor asked to reset scope.
    const early = route.slice(at("const earlySelectedVehicleId"), at("const earlySelectedVehicleRead"));
    expect(early).toContain("hasScopeResetIntent(lastUser.content)");
    expect(early).toContain("vehicleIdFromPublicPagePath(body.pagePath)");
  });

  it("keeps the tenant-wide facet vocabulary unscoped", () => {
    // Regression guard for the BMW -> Camry bug, now that the call moved.
    const call = route.slice(at(FACETS_START), at(FACETS_START) + 160);
    expect(call).toContain("p_make: null");
    expect(call).toContain("p_state: null");
  });

  it("uses the cached tenant lookup on the chat route only", () => {
    expect(route).toContain("getTenantFromRequestCached(request)");
    for (const other of [
      "apps/admin/app/api/leads/route.ts",
      "apps/admin/app/api/vehicles/route.ts",
      "apps/admin/app/api/gdpr/delete/route.ts",
      "apps/admin/app/api/visitor/login/route.ts",
    ]) {
      const source = readFileSync(resolve(process.cwd(), other), "utf8");
      expect(source, other).not.toContain("getTenantFromRequestCached");
    }
  });
});

describe("public chat route: model context shares one round trip", () => {
  it("loads image descriptions and the inventory count with the other context reads", () => {
    const contextAll = at("] = await Promise.all([", at(DETERMINISTIC_RETURN));
    const contextEnd = at("chatLoyaltyContext = loadedLoyaltyContext");
    const images = at('.from("vehicle_images")');
    const count = at("tenantLiveVehicleCount(tenant.tenantId");
    expect(images).toBeGreaterThan(contextAll);
    expect(images).toBeLessThan(contextEnd);
    expect(count).toBeGreaterThan(contextAll);
    expect(count).toBeLessThan(contextEnd);
  });

  it("keeps the chunk order: retrieved, then the open vehicle, then images", () => {
    const unshift = at("contextChunks.unshift(selectedVehicleChunk)");
    const push = at('category: "vehicle-image"');
    expect(unshift).toBeLessThan(push);
    expect(push).toBeLessThan(at("assembled = assembleSystemPrompt("));
  });
});

describe("public chat route: telemetry stays off the response path", () => {
  it("defers trace and PostHog writes to after()", () => {
    const helper = route.slice(at("function queueInternalConciergeTrace("));
    expect(helper.slice(0, 900)).toContain("after(async");
    expect(route).not.toContain("posthog");
  });

  it("never lets a telemetry failure throw into the turn", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {
      throw new Error("log sink down");
    });
    try {
      expect(() =>
        recordConciergeTurn({
          surface: "public",
          requestId: "r1",
          tenantId: "t1",
          route: "deterministic",
        }),
      ).not.toThrow();
    } finally {
      info.mockRestore();
    }
  });
});

describe("settle / unwrapSettled", () => {
  const unhandled = vi.fn();
  afterEach(() => {
    process.off("unhandledRejection", unhandled);
    unhandled.mockReset();
  });

  it("holds an early failure without an unhandled rejection", async () => {
    process.on("unhandledRejection", unhandled);
    const held = settle(Promise.reject(new Error("read failed")));
    // Give the runtime every chance to report it before anyone awaits.
    await new Promise((resolveTick) => setTimeout(resolveTick, 20));
    expect(unhandled).not.toHaveBeenCalled();
    await expect(unwrapSettled(held)).rejects.toThrow("read failed");
  });

  it("re-throws the original error object where the result is used", async () => {
    const original = new Error("vehicle lookup failed");
    await expect(unwrapSettled(settle(Promise.reject(original)))).rejects.toBe(original);
  });

  it("passes a value through unchanged", async () => {
    const value = { data: [1, 2, 3] };
    await expect(unwrapSettled(settle(Promise.resolve(value)))).resolves.toBe(value);
  });

  it("starts a lazy thenable immediately", async () => {
    // Supabase builders only execute when then() is called. settle() must
    // call it at once, or the read would not actually overlap anything.
    const then = vi.fn((resolveThen: (value: string) => void) => resolveThen("ok"));
    const held = settle({ then } as unknown as PromiseLike<string>);
    await Promise.resolve();
    expect(then).toHaveBeenCalledTimes(1);
    await expect(unwrapSettled(held)).resolves.toBe("ok");
  });
});
