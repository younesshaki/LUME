import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../consent";

function response() {
  const res = {
    statusCode: 0,
    payload: undefined as unknown,
    headers: {} as Record<string, string>,
    ended: false,
    status(code: number) { res.statusCode = code; return res; },
    setHeader(name: string, value: string) { res.headers[name] = value; },
    json(body: unknown) { res.payload = body; },
    write() {},
    end() { res.ended = true; },
  };
  return res;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("public consent proxy", () => {
  it("forwards the visitor's choice to the admin /api/consent with tenant scope", async () => {
    vi.stubEnv("LUME_CHAT_UPSTREAM_URL", "https://admin.example");
    vi.stubEnv("LUME_CHAT_BYPASS_SECRET", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    const res = response();
    await handler({
      method: "POST",
      body: { choice: "essential", version: 1 },
      headers: { "content-type": "application/json", "x-lume-tenant": "demo-sean", origin: "https://site.example" },
      query: {},
    }, res);
    expect(res.statusCode).toBe(204);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("https://admin.example/api/consent");
    expect((init as RequestInit).headers).toMatchObject({ "x-lume-tenant": "demo-sean", origin: "https://site.example" });
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ choice: "essential", version: 1 });
  });

  it("rejects other methods and reports a missing upstream", async () => {
    const get = response();
    await handler({ method: "GET", headers: {}, query: {} }, get);
    expect(get.statusCode).toBe(405);

    vi.stubEnv("LUME_CHAT_UPSTREAM_URL", "");
    const post = response();
    await handler({ method: "POST", headers: {}, query: {} }, post);
    expect(post.statusCode).toBe(503);
  });
});
