// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("public lead proxy", () => {
  it("derives the lead upstream, forwards attribution, and strips unrelated cookies", async () => {
    vi.stubEnv("LUME_CHAT_UPSTREAM_URL", "https://admin.example/api/chat");
    vi.stubEnv("LUME_CHAT_BYPASS_SECRET", "bypass-secret");
    const fetchMock = vi.fn(async () => Response.json({ leadId: "lead-1" }, {
      status: 201,
      headers: {
        "X-Lume-Quota-Warning": "lead_requests; remaining=2; limit=10",
        "Access-Control-Expose-Headers": "X-Lume-Quota-Warning",
      },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { default: handler } = await import("./leads");
    const response = responseRecorder();

    await handler({
      method: "POST",
      body: { email: "visitor@example.com", vehicleId: "vehicle-1" },
      headers: {
        origin: "https://public.example",
        referer: "https://public.example/vehicles/vehicle-1",
        "user-agent": "browser",
        "x-forwarded-for": "203.0.113.1",
        "x-lume-tenant": "tenant-one",
        cookie: "analytics=abc; lume_visitor_session=secure-token==; admin_session=private",
      },
      query: { tenant: "tenant-one" },
    }, response.value);

    expect(response.status).toBe(201);
    expect(JSON.parse(response.body())).toEqual({ leadId: "lead-1" });
    expect(response.headers.get("x-lume-quota-warning"))
      .toBe("lead_requests; remaining=2; limit=10");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://admin.example/api/leads?tenant=tenant-one");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      origin: "https://public.example",
      referer: "https://public.example/vehicles/vehicle-1",
      "user-agent": "browser",
      "x-forwarded-for": "203.0.113.1",
      "x-lume-tenant": "tenant-one",
      cookie: "lume_visitor_session=secure-token==",
      "x-vercel-protection-bypass": "bypass-secret",
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      email: "visitor@example.com",
      vehicleId: "vehicle-1",
    });
  });

  it("preserves validation errors from an explicit lead upstream", async () => {
    vi.stubEnv("LUME_LEADS_UPSTREAM_URL", "https://admin.example/api/leads");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Vehicle is unavailable" }, {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })));
    const { default: handler } = await import("./leads");
    const response = responseRecorder();

    await handler({
      method: "POST",
      body: { email: "visitor@example.com", vehicleId: "wrong-tenant" },
      headers: { "x-lume-tenant": "tenant-one" },
      query: {},
    }, response.value);

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body())).toEqual({ error: "Vehicle is unavailable" });
  });

  it("fails closed when no valid upstream can be resolved", async () => {
    vi.stubEnv("LUME_CHAT_UPSTREAM_URL", "not-a-url");
    const { default: handler } = await import("./leads");
    const response = responseRecorder();

    await handler({ method: "POST", body: {}, headers: {}, query: {} }, response.value);

    expect(response.status).toBe(500);
    expect(JSON.parse(response.body())).toEqual({ error: "Lead upstream not configured" });
  });
});

function responseRecorder() {
  let statusCode = 200;
  const headers = new Map<string, string>();
  const chunks: Uint8Array[] = [];
  const value = {
    status(code: number) {
      statusCode = code;
      return value;
    },
    setHeader(name: string, headerValue: string) {
      headers.set(name.toLowerCase(), headerValue);
    },
    json(payload: unknown) {
      chunks.push(new TextEncoder().encode(JSON.stringify(payload)));
    },
    write(chunk: Uint8Array | string) {
      chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
    },
    end() {
      return undefined;
    },
  };
  return {
    value,
    headers,
    get status() {
      return statusCode;
    },
    body() {
      const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
      const joined = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        joined.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return new TextDecoder().decode(joined);
    },
  };
}
