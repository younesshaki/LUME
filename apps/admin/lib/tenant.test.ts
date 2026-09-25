// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearTenantResolutionCache,
  extractTenantSlugFromRequest,
  hasConflictingTenantSelectors,
  resolveTenantBySlugCached,
  TENANT_RESOLUTION_CACHE_TTL_MS,
} from "./tenant";

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

describe("resolveTenantBySlugCached", () => {
  const acme = { tenantId: "tenant-acme", slug: "acme", name: "Acme" };
  const globex = { tenantId: "tenant-globex", slug: "globex", name: "Globex" };
  const NOW = 1_800_000_000_000;

  beforeEach(() => clearTenantResolutionCache());

  it("never answers one slug with another slug's tenant", async () => {
    const resolveSlug = vi.fn(async (slug: string) =>
      slug === "acme" ? acme : slug === "globex" ? globex : null,
    );
    expect(await resolveTenantBySlugCached("acme", NOW, resolveSlug)).toEqual(acme);
    expect(await resolveTenantBySlugCached("globex", NOW, resolveSlug)).toEqual(globex);
    expect(await resolveTenantBySlugCached("acme", NOW + 1, resolveSlug)).toEqual(acme);
    expect(await resolveTenantBySlugCached("globex", NOW + 1, resolveSlug)).toEqual(globex);
    expect(resolveSlug).toHaveBeenCalledTimes(2);
  });

  it("serves a hit without a lookup inside the window", async () => {
    const resolveSlug = vi.fn(async () => acme);
    await resolveTenantBySlugCached("acme", NOW, resolveSlug);
    await resolveTenantBySlugCached("acme", NOW + TENANT_RESOLUTION_CACHE_TTL_MS - 1, resolveSlug);
    expect(resolveSlug).toHaveBeenCalledTimes(1);
  });

  it("looks the tenant up again once the window expires", async () => {
    // Bounds how long a just-suspended tenant can still be served.
    const resolveSlug = vi.fn(async () => acme);
    await resolveTenantBySlugCached("acme", NOW, resolveSlug);
    await resolveTenantBySlugCached("acme", NOW + TENANT_RESOLUTION_CACHE_TTL_MS, resolveSlug);
    expect(resolveSlug).toHaveBeenCalledTimes(2);
  });

  it("never caches an unknown, inactive or failed lookup", async () => {
    // resolveTenantBySlug returns null for all three; a new or reactivated
    // tenant must be served on its very next request.
    const resolveSlug = vi
      .fn<(slug: string) => Promise<typeof acme | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(acme);
    expect(await resolveTenantBySlugCached("acme", NOW, resolveSlug)).toBeNull();
    expect(await resolveTenantBySlugCached("acme", NOW + 1, resolveSlug)).toEqual(acme);
  });

  it("shares one lookup between concurrent misses", async () => {
    let release: (tenant: typeof acme) => void = () => undefined;
    const resolveSlug = vi.fn(
      () => new Promise<typeof acme>((resolveLookup) => (release = resolveLookup)),
    );
    const first = resolveTenantBySlugCached("acme", NOW, resolveSlug);
    const second = resolveTenantBySlugCached("acme", NOW, resolveSlug);
    release(acme);
    await expect(Promise.all([first, second])).resolves.toEqual([acme, acme]);
    expect(resolveSlug).toHaveBeenCalledTimes(1);
  });

  it("does not coalesce different slugs", async () => {
    const resolveSlug = vi.fn(async (slug: string) => (slug === "acme" ? acme : globex));
    const [a, g] = await Promise.all([
      resolveTenantBySlugCached("acme", NOW, resolveSlug),
      resolveTenantBySlugCached("globex", NOW, resolveSlug),
    ]);
    expect(a).toEqual(acme);
    expect(g).toEqual(globex);
  });
});
