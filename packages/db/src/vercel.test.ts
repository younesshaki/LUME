import { describe, expect, it, vi } from "vitest";
import { createVercelDomainClient, VercelDomainApiError } from "./vercel";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const projectDomain = {
  name: "cars.example.com",
  apexName: "example.com",
  projectId: "prj_123",
  verified: false,
  verification: [{ type: "TXT", domain: "_vercel.example.com", value: "vc-domain-verify=abc" }],
};

const domainConfig = {
  configuredBy: "CNAME",
  acceptedChallenges: ["dns-01"],
  recommendedIPv4: [{ rank: 1, value: ["76.76.21.21"] }],
  recommendedCNAME: [{ rank: 1, value: "cname.vercel-dns.com" }],
  misconfigured: true,
};

describe("Vercel domain client", () => {
  it("is a network-free no-op without credentials", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const client = createVercelDomainClient({ fetch: fetchImpl });
    await expect(client.addDomain("cars.example.com")).resolves.toEqual({ status: "not_configured" });
    await expect(client.removeDomain("cars.example.com")).resolves.toEqual({ status: "not_configured" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("adds a project domain and returns a bounded normalized snapshot", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(domainConfig))
      .mockResolvedValueOnce(jsonResponse(projectDomain));
    const client = createVercelDomainClient({
      token: "secret",
      projectId: "prj_123",
      teamId: "team_123",
      fetch: fetchImpl,
      now: () => new Date("2026-07-12T00:00:00.000Z"),
    });

    await expect(client.addDomain("cars.example.com")).resolves.toMatchObject({
      status: "configured",
      verified: false,
      misconfigured: true,
      recommendedCname: ["cname.vercel-dns.com"],
      checkedAt: "2026-07-12T00:00:00.000Z",
    });
    const addUrl = String(fetchImpl.mock.calls[1]?.[0]);
    expect(addUrl).toBe("https://api.vercel.com/v10/projects/prj_123/domains?teamId=team_123");
    expect(fetchImpl.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ name: "cars.example.com" }),
    });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(
      "/v6/domains/cars.example.com/config?teamId=team_123&projectIdOrName=prj_123",
    );
  });

  it("uses the verify and idempotent remove endpoints", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ...domainConfig, misconfigured: false }))
      .mockResolvedValueOnce(jsonResponse({ ...projectDomain, verified: true }))
      .mockResolvedValueOnce(jsonResponse({ error: { code: "not_found" } }, 404));
    const client = createVercelDomainClient({ token: "secret", projectId: "project", fetch: fetchImpl });

    await expect(client.verifyDomain("cars.example.com")).resolves.toMatchObject({
      status: "configured",
      verified: true,
    });
    await expect(client.removeDomain("cars.example.com")).resolves.toEqual({ status: "removed" });
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain(
      "/v9/projects/project/domains/cars.example.com/verify",
    );
    expect(fetchImpl.mock.calls[1]?.[1]?.method).toBe("POST");
    expect(fetchImpl.mock.calls[2]?.[1]?.method).toBe("DELETE");
  });

  it("does not mutate the project when the DNS configuration check fails", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ error: { code: "forbidden", message: "No access" } }, 403),
    );
    const client = createVercelDomainClient({ token: "secret", projectId: "project", fetch: fetchImpl });

    await expect(client.addDomain("cars.example.com")).rejects.toMatchObject({ status: 403 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe("GET");
  });

  it("returns a typed provider error without exposing the token", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ error: { code: "forbidden", message: "No domain access" } }, 403),
    );
    const client = createVercelDomainClient({ token: "top-secret", projectId: "project", fetch: fetchImpl });
    const error = await client.getDomain("cars.example.com").catch((value: unknown) => value);
    expect(error).toBeInstanceOf(VercelDomainApiError);
    expect(error).toMatchObject({ status: 403, code: "forbidden", message: "No domain access" });
    expect(String(error)).not.toContain("top-secret");
  });
});
