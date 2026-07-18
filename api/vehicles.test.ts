import { describe, expect, it } from "vitest";
import { hasStableTenantCacheKey, inventoryCacheControl } from "./vehicles";

type RequestLike = Parameters<typeof inventoryCacheControl>[0];

function request(query: RequestLike["query"], headers: RequestLike["headers"] = {}): RequestLike {
  return { method: "GET", query, headers };
}

describe("public inventory cache key", () => {
  it("allows a short shared cache only for an explicit, unambiguous tenant URL", () => {
    const req = request({ tenant: "demo" });
    expect(hasStableTenantCacheKey(req)).toBe(true);
    expect(inventoryCacheControl(req)).toBe("public, max-age=0, s-maxage=10, must-revalidate");
  });

  it("keeps header-only and conflicting tenant requests private", () => {
    expect(inventoryCacheControl(request({}, { "x-lume-tenant": "demo" }))).toBe("private, no-cache");
    expect(inventoryCacheControl(request({ tenant: "demo" }, { "x-lume-tenant": "other" }))).toBe("private, no-cache");
  });
});
