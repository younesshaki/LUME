import { describe, expect, it, vi } from "vitest";
import handler from "../visitor/[...path]";

type TestResponse = {
  statusCode: number | null;
  payload: unknown;
  status: (statusCode: number) => TestResponse;
  setHeader: () => void;
  json: (payload: unknown) => void;
  write: () => void;
  end: () => void;
};

function response(): TestResponse {
  return {
    statusCode: null,
    payload: undefined,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    setHeader() {},
    json(payload) { this.payload = payload; },
    write() {},
    end() {},
  };
}

describe("public visitor proxy", () => {
  it("answers an anonymous account check without calling the Admin upstream", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = response();

    await handler({
      method: "GET",
      url: "/api/visitor/me?tenant=demo",
      headers: {},
      query: { path: ["me"], tenant: "demo" },
    }, res);

    // 200 + null, not 401: browsers log every 4xx as a console error, and
    // every public page asks.
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({ visitor: null });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
