// @vitest-environment node
import { describe, expect, it } from "vitest";
import { extractTenantSlugFromRequest, hasConflictingTenantSelectors } from "./tenant";

describe("extractTenantSlugFromRequest", () => {
  it("prefers the explicit tenant header", () => {
    const request = new Request("https://www.example.com/chat?tenant=query", {
      headers: {
        host: "subdomain.example.com",
        "x-lume-tenant": " header-tenant ",
      },
    });

    expect(extractTenantSlugFromRequest(request)).toBe("header-tenant");
  });

  it("falls back to the tenant query parameter", () => {
    const request = new Request("https://www.example.com/chat?tenant=query-tenant", {
      headers: { host: "subdomain.example.com" },
    });

    expect(extractTenantSlugFromRequest(request)).toBe("query-tenant");
  });

  it("uses non-reserved subdomains when no explicit slug is provided", () => {
    const request = new Request("https://acme.lume.example/chat");

    expect(extractTenantSlugFromRequest(request)).toBe("acme");
  });

  it("ignores apex hosts and reserved subdomains", () => {
    expect(
      extractTenantSlugFromRequest(new Request("https://lume.example/chat"))
    ).toBeNull();
    expect(
      extractTenantSlugFromRequest(new Request("https://admin.lume.example/chat"))
    ).toBeNull();
  });
});

describe("hasConflictingTenantSelectors", () => {
  it("rejects disagreement between the tenant header and query", () => {
    expect(hasConflictingTenantSelectors(new Request("https://lume.example/api?tenant=acme", {
      headers: { "x-lume-tenant": "other" },
    }))).toBe(true);
  });

  it("accepts matching or single tenant selectors", () => {
    expect(hasConflictingTenantSelectors(new Request("https://lume.example/api?tenant=acme", {
      headers: { "x-lume-tenant": "acme" },
    }))).toBe(false);
    expect(hasConflictingTenantSelectors(
      new Request("https://lume.example/api?tenant=acme"),
    )).toBe(false);
  });
});
