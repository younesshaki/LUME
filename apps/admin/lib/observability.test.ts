import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureError,
  errorSignature,
  recordChatInterpretationShadow,
  resetErrorDedupe,
  withRouteErrorCapture,
} from "./observability";

describe("captureError", () => {
  beforeEach(() => {
    resetErrorDedupe();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("emits a structured payload with scope, message, and bounded stack", () => {
    const payload = captureError(
      "api/test",
      new Error("boom"),
      { tenantId: "t1" },
      () => 1_000,
    );
    expect(payload).not.toBeNull();
    expect(payload).toMatchObject({
      level: "error",
      scope: "api/test",
      message: "boom",
      context: { tenantId: "t1" },
      suppressed: 0,
    });
    expect(
      payload!.stack === null || payload!.stack.split("\n").length <= 8,
    ).toBe(true);
    expect(console.error).toHaveBeenCalledOnce();
  });

  it("dedupes identical signatures within the window and counts suppressions", () => {
    expect(captureError("s", new Error("same"), {}, () => 0)).not.toBeNull();
    expect(captureError("s", new Error("same"), {}, () => 10_000)).toBeNull();
    expect(captureError("s", new Error("same"), {}, () => 20_000)).toBeNull();
    // After the window, the next capture reports what was suppressed.
    const reEmitted = captureError("s", new Error("same"), {}, () => 61_000);
    expect(reEmitted?.suppressed).toBe(2);
  });

  it("different scopes or messages are independent signatures", () => {
    expect(errorSignature("a", new Error("x"))).not.toBe(
      errorSignature("b", new Error("x")),
    );
    expect(captureError("a", new Error("x"), {}, () => 0)).not.toBeNull();
    expect(captureError("a", new Error("y"), {}, () => 1)).not.toBeNull();
  });

  it("handles non-Error values and drops undefined context entries", () => {
    const payload = captureError(
      "s2",
      "string failure",
      { a: undefined, b: 1 },
      () => 0,
    );
    expect(payload?.message).toBe("string failure");
    expect(payload?.stack).toBeNull();
    expect(payload?.context).toEqual({ b: 1 });
  });
});

describe("recordChatInterpretationShadow", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("records paid failures and only privacy-safe comparison metadata", () => {
    const record = recordChatInterpretationShadow({
      requestId: "request-1",
      tenantId: "tenant-1",
      provider: "moonshot",
      modelId: "kimi-k2.6",
      schemaVersion: 1,
      outcome: "malformed",
      durationMs: 123,
      usage: { inputTokens: null, outputTokens: null },
      comparison: null,
      now: () => 1_000,
    });
    expect(record).toMatchObject({
      scope: "concierge.interpretation.shadow",
      requestId: "request-1",
      outcome: "malformed",
      modelCalls: 1,
      durationMs: 123,
      kindAgrees: null,
    });
    expect(console.info).toHaveBeenCalledOnce();
  });

  it("cannot accept message text, filter values, output or action parameters", () => {
    const source = recordChatInterpretationShadow.toString();
    for (const forbidden of [
      "userMessage",
      "lastUser",
      "candidate.setFilters",
      "vehicleId",
      "modelOutput",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});

describe("withRouteErrorCapture", () => {
  beforeEach(() => {
    resetErrorDedupe();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("passes successful responses through", async () => {
    const handler = withRouteErrorCapture(
      "route",
      async () => new Response("ok", { status: 201 }),
    );
    const response = await handler(new Request("https://x.test/api/y"));
    expect(response.status).toBe(201);
  });

  it("captures unhandled throws and answers a generic 500", async () => {
    const handler = withRouteErrorCapture("route", async () => {
      throw new Error("secret internal detail");
    });
    const response = await handler(new Request("https://x.test/api/y"));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("Internal error");
    expect(JSON.stringify(body)).not.toContain("secret internal detail");
    expect(console.error).toHaveBeenCalled();
  });
});
