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
