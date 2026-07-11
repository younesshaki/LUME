import { describe, expect, it, vi } from "vitest";
import { createVisitorClient, VisitorApiError } from "./visitorClient";

const visitor = {
  id: "visitor-1",
  email: "guest@example.com",
  firstName: "Amina",
  lastName: "Noor",
  createdAt: "2026-07-11T00:00:00.000Z",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("visitor client", () => {
  it("sends tenant scope, credentials, and the sign-up payload", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ visitorId: "visitor-1" }, 201)
    );
    const client = createVisitorClient({ fetcher, tenantSlug: "atelier" });
    const input = {
      email: "guest@example.com",
      password: "long-enough-password",
      firstName: "Amina",
    };

    await expect(client.signup(input)).resolves.toEqual({ visitorId: "visitor-1" });

    const [path, init] = fetcher.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(path).toBe("/api/visitor/signup");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
    expect(headers.get("X-Lume-Tenant")).toBe("atelier");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual(input);
  });

  it("returns the visitor from login and treats a 401 session as anonymous", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ visitor }))
      .mockResolvedValueOnce(jsonResponse({ message: "Unauthorized" }, 401));
    const client = createVisitorClient({ fetcher, tenantSlug: "default" });

    await expect(
      client.login({ email: visitor.email, password: "long-enough-password" })
    ).resolves.toEqual(visitor);
    await expect(client.getMe()).resolves.toBeNull();
  });

  it("parses loyalty balances, tiers, and transactions", async () => {
    const loyalty = {
      points: 720,
      tier: { name: "Gold", threshold: 1_000 },
      transactions: [
        {
          id: "tx-1",
          delta: 120,
          reason: "Invitation referral",
          createdAt: "2026-07-10T00:00:00.000Z",
        },
      ],
    };
    const client = createVisitorClient({
      fetcher: async () => jsonResponse(loyalty),
      tenantSlug: "default",
    });

    await expect(client.getLoyalty()).resolves.toEqual(loyalty);
  });

  it("logs out with a credentialed tenant-scoped POST and accepts an empty 204", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(null, { status: 204 })
    );
    const client = createVisitorClient({ fetcher, tenantSlug: "atelier" });

    await expect(client.logout()).resolves.toBeUndefined();

    const [path, init] = fetcher.mock.calls[0];
    expect(path).toBe("/api/visitor/logout");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
    expect(new Headers(init?.headers).get("X-Lume-Tenant")).toBe("atelier");
  });

  it("surfaces API messages with the response status", async () => {
    const client = createVisitorClient({
      fetcher: async () => jsonResponse({ message: "Email already registered." }, 409),
      tenantSlug: "default",
    });

    const error = await client.signup({
      email: visitor.email,
      password: "long-enough-password",
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(VisitorApiError);
    expect(error).toMatchObject({ status: 409, message: "Email already registered." });
  });

  it("rejects malformed successful responses", async () => {
    const client = createVisitorClient({
      fetcher: async () => jsonResponse({ visitor: { id: "incomplete" } }),
      tenantSlug: "default",
    });

    await expect(
      client.login({ email: visitor.email, password: "long-enough-password" })
    ).rejects.toThrow("login response was invalid");
  });
});
