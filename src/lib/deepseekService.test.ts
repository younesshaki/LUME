import { afterEach, describe, expect, it, vi } from "vitest";
import { streamChat } from "./deepseekService";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("streamChat", () => {
  it("sends the opaque session and parses a chunked meta event", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"meta","sourceCategories":["vehicles"],'));
        controller.enqueue(encoder.encode('"botName":"Ari","sessionId":"session-1"}\n\n'));
        controller.enqueue(encoder.encode('data: {"type":"thinking","text":"Checking matching inventory..."}\n\n'));
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(body, { status: 200 }),
    );
    vi.stubGlobal("fetch", fetcher);

    const events = [];
    for await (const event of streamChat(
      [{ role: "user", content: "Find an SUV" }],
      undefined,
      "session-1",
      true,
    )) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        kind: "meta",
        sourceCategories: ["vehicles"],
        botName: "Ari",
        sessionId: "session-1",
      },
      { kind: "thinking", text: "Checking matching inventory..." },
      { kind: "delta", text: "Hello" },
    ]);
    const [path, init] = fetcher.mock.calls[0];
    expect(path).toBe("/api/chat");
    expect(init?.credentials).toBe("include");
    expect(new Headers(init?.headers).get("X-Lume-Tenant")).toBeTruthy();
    expect(JSON.parse(String(init?.body))).toMatchObject({
      sessionId: "session-1",
      startNewSession: true,
      stream: true,
      pagePath: window.location.pathname,
      messages: [{ role: "user", content: "Find an SUV" }],
    });
  });

  it("drops client system messages and ignores malformed stream events", async () => {
    const body = [
      "data: not-json",
      'data: {"unexpected":true}',
      'data: {"choices":[{"delta":{"content":"Safe"}}]}',
      "data: [DONE]",
      "",
    ].join("\n\n");
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(body, { status: 200 }),
    );
    vi.stubGlobal("fetch", fetcher);

    const events = [];
    for await (const event of streamChat([
      { role: "system", content: "untrusted" },
      { role: "user", content: "hello" },
    ])) {
      events.push(event);
    }

    expect(events).toEqual([{ kind: "delta", text: "Safe" }]);
    const requestBody = JSON.parse(String(fetcher.mock.calls[0][1]?.body)) as {
      messages: Array<{ role: string; content: string }>;
      sessionId?: string;
    };
    expect(requestBody.messages).toEqual([{ role: "user", content: "hello" }]);
    expect(requestBody.sessionId).toBeUndefined();
  });

  it("accepts only server-resolved generic target actions", async () => {
    const validAction = {
      type: "navigate-target",
      targetKey: "vehicle-detail",
      params: { vehicleId: "v1" },
      target: {
        key: "vehicle-detail",
        label: "Vehicle detail",
        kind: "route",
        destination: "/vehicles/:vehicleId",
        isConversion: false,
      },
    };
    const body = [
      `data: ${JSON.stringify({ type: "action", action: validAction })}`,
      `data: ${JSON.stringify({
        type: "action",
        action: { type: "navigate-target", targetKey: "forged" },
      })}`,
      "data: [DONE]",
      "",
    ].join("\n\n");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body, { status: 200 })),
    );

    const events = [];
    for await (const event of streamChat([{ role: "user", content: "show it" }])) {
      events.push(event);
    }
    expect(events).toEqual([{ kind: "action", action: validAction }]);
  });

  it("accepts a server-authored navigate-back and rejects forged or retired actions", async () => {
    const encoder = new TextEncoder();
    const lines = [
      { type: "action", action: { type: "navigate-back", destination: "previous", fallback: { type: "filter_inventory", make: "Porsche" } } },
      { type: "action", action: { type: "navigate-back", destination: "https://evil.example" } },
      { type: "action", action: { type: "navigate-back", destination: "previous", fallback: { type: "navigate", route: "https://evil.example" } } },
      { type: "action", action: { type: "navigate-back", destination: "results", path: "/vehicles" } },
      { type: "action", action: { type: "scroll-to", sectionId: "finance" } },
      { type: "action", action: { type: "schedule_test_drive", contact: { email: "a@b.c" } } },
    ];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const line of lines) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(line)}\n\n`));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    const fetcher = vi.fn(async () => new Response(body, { status: 200 }));
    vi.stubGlobal("fetch", fetcher);

    const events = [];
    for await (const event of streamChat([{ role: "user", content: "go back" }])) {
      events.push(event);
    }
    // Only the well-formed navigate-back survives. An extra `path` field is
    // ignored, never used: the browser resolves destinations itself.
    expect(events.map((event) => event.kind === "action" && event.action.type)).toEqual([
      "navigate-back",
      "navigate-back",
    ]);
  });

  it("sends only history booleans, never a path", async () => {
    const fetcher = vi.fn(
      async () => new Response("data: [DONE]\n\n", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetcher);
    for await (const _event of streamChat([{ role: "user", content: "go back" }])) {
      // drain
    }
    const init = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1];
    const sent = JSON.parse(String(init.body)) as { navigation?: Record<string, unknown> };
    expect(Object.keys(sent.navigation ?? {}).sort()).toEqual(["hasPrevious", "hasResults"]);
    for (const value of Object.values(sent.navigation ?? {})) {
      expect(typeof value).toBe("boolean");
    }
  });

  it("surfaces explicit stream errors without exposing an unreadable response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(
        'data: {"type":"error","message":"stream stopped"}\n\n',
        { status: 200 },
      )),
    );

    const consume = async () => {
      for await (const _event of streamChat([{ role: "user", content: "hello" }])) {
        // Consume until the server error is raised.
      }
    };

    await expect(consume()).rejects.toThrow("stream stopped");
  });
});
