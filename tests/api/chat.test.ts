// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("public chat proxy quota responses", () => {
  it("preserves an upstream quota 429 body and status", async () => {
    vi.stubEnv("LUME_CHAT_UPSTREAM_URL", "https://admin.example/api/chat");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      error: "quota_exceeded",
      limit_type: "chat_requests",
      resets_at: "2026-08-01T00:00:00.000Z",
    }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Expose-Headers": "X-Lume-Quota-Warning",
      },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { default: handler } = await import("../../api/chat");
    const response = responseRecorder();

    await handler({
      method: "POST",
      body: { messages: [{ role: "user", content: "Hello" }] },
      headers: {
        origin: "https://public.example",
        "x-lume-tenant": "tenant-one",
      },
      query: {},
    }, response.value);

    expect(response.status).toBe(429);
    expect(response.headers.has("x-lume-quota-warning")).toBe(false);
    expect(response.headers.get("access-control-expose-headers"))
      .toBe("X-Lume-Quota-Warning");
    expect(JSON.parse(response.body())).toEqual({
      error: "quota_exceeded",
      limit_type: "chat_requests",
      resets_at: "2026-08-01T00:00:00.000Z",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("forwards a near-limit warning on an accepted upstream stream", async () => {
    vi.stubEnv("LUME_CHAT_UPSTREAM_URL", "https://admin.example/api/chat");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("data: [DONE]\n\n", {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "X-Lume-Quota-Warning": "chat_requests; remaining=2; limit=10",
        "Access-Control-Expose-Headers": "X-Lume-Quota-Warning",
      },
    })));
    const { default: handler } = await import("../../api/chat");
    const response = responseRecorder();

    await handler({
      method: "POST",
      body: { messages: [{ role: "user", content: "Hello" }] },
      headers: { "x-lume-tenant": "tenant-one" },
      query: {},
    }, response.value);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-lume-quota-warning"))
      .toBe("chat_requests; remaining=2; limit=10");
    expect(response.body()).toBe("data: [DONE]\n\n");
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
