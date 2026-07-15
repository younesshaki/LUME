// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("public lead proxy", () => {
  it("forwards the tenant and only the visitor cookie to the canonical API", async () => {
    vi.stubEnv("LUME_LEADS_UPSTREAM_URL", "https://admin.example/api/leads");
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ leadId: "lead-1" }), {
      status: 201,
      headers: {
        "Content-Type": "application/json",
        "X-Lume-Quota-Warning": "lead_requests; remaining=2; limit=10",
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { default: handler } = await import("./leads");
    const response = responseRecorder();
    await handler({
      method: "POST",
      body: { email: "visitor@example.com" },
      headers: {
        "x-lume-tenant": "atelier",
        cookie: "analytics=opaque; lume_visitor_session=visitor-token; admin=private",
      },
      query: { tenant: "atelier" },
    }, response.value);

    expect(fetchMock).toHaveBeenCalledOnce();
    const url = fetchMock.mock.calls[0]?.[0];
    const init = fetchMock.mock.calls[0]?.[1];
    expect(url).toBe("https://admin.example/api/leads?tenant=atelier");
    expect(init.headers).toMatchObject({
      "x-lume-tenant": "atelier",
      cookie: "lume_visitor_session=visitor-token",
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("x-lume-quota-warning"))
      .toBe("lead_requests; remaining=2; limit=10");
    expect(JSON.parse(response.body())).toEqual({ leadId: "lead-1" });
  });

  it("derives the canonical lead route from the configured chat upstream", async () => {
    vi.stubEnv("LUME_CHAT_UPSTREAM_URL", "https://admin.example/api/chat?legacy=1");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ leadId: "lead-1" }, { status: 201 })));

    const { default: handler } = await import("./leads");
    const response = responseRecorder();
    await handler({ method: "POST", body: {}, headers: {}, query: {} }, response.value);

    expect(fetch).toHaveBeenCalledWith("https://admin.example/api/leads", expect.objectContaining({
      method: "POST",
    }));
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
