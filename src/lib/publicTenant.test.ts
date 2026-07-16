import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearTenantIdCacheForTests,
  publicTenantSlugFromHostname,
  resolvePublicTenant,
  resolveTenantId,
} from "./publicTenant";

type FakeTenantRow = {
  id: string;
  slug: string;
  name: string;
  status: "active" | "suspended" | "trial";
};

function fakeClient(rows: FakeTenantRow[], error: unknown = null) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: rows, error }),
  };
}

describe("resolveTenantId", () => {
  afterEach(() => {
    clearTenantIdCacheForTests();
  });

  it("resolves and caches active tenant ids by normalized slug", async () => {
    const client = fakeClient([
      { id: "tenant-1", slug: "default", name: "Default", status: "active" },
    ]);

    await expect(resolveTenantId(" DEFAULT ", client)).resolves.toBe("tenant-1");
    await expect(resolveTenantId("default", client)).resolves.toBe("tenant-1");

    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.rpc).toHaveBeenCalledWith("tenant_by_slug", { p_slug: "default" });
  });

  it("exposes the tenant name from the same cached resolution", async () => {
    const client = fakeClient([
      { id: "tenant-1", slug: "atelier", name: "Atelier Motors", status: "active" },
    ]);

    await expect(resolvePublicTenant("ATELIER", client)).resolves.toEqual({
      id: "tenant-1",
      slug: "atelier",
      name: "Atelier Motors",
    });
    await expect(resolveTenantId("atelier", client)).resolves.toBe("tenant-1");

    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it("returns null for inactive tenants", async () => {
    const client = fakeClient([
      { id: "tenant-1", slug: "default", name: "Default", status: "suspended" },
    ]);

    await expect(resolveTenantId("default", client)).resolves.toBeNull();
  });

  it("returns null and does not cache failed lookups", async () => {
    const client = fakeClient([], { message: "network unavailable" });

    await expect(resolveTenantId("default", client)).resolves.toBeNull();
    await expect(resolveTenantId("default", client)).resolves.toBeNull();

    expect(client.rpc).toHaveBeenCalledTimes(2);
  });
});

describe("publicTenantSlugFromHostname", () => {
  it("resolves customer subdomains on real hostnames", () => {
    expect(publicTenantSlugFromHostname("atelier.lume.example")).toBe("atelier");
  });

  it("ignores local, IP, Vercel preview, and reserved hostnames", () => {
    expect(publicTenantSlugFromHostname("127.0.0.1")).toBeNull();
    expect(publicTenantSlugFromHostname("::1")).toBeNull();
    expect(publicTenantSlugFromHostname("tenant.localhost")).toBeNull();
    expect(publicTenantSlugFromHostname("lume-git-staging.example.vercel.app")).toBeNull();
    expect(publicTenantSlugFromHostname("www.lume.example")).toBeNull();
  });
});
