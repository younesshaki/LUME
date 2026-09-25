import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BotAction } from "@lume/types";
import { streamChat } from "./deepseekService";
import { botActionBus } from "./botActionBus";
import { createChatTurnSequencer, newChatRequestId } from "./chatTurnSequencer";

afterEach(() => {
  vi.unstubAllGlobals();
  botActionBus.clear();
});

/** One SSE stream carrying a meta event, an action, and a delta. */
function sseStream(action: BotAction, requestId: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: {"type":"meta","sourceCategories":[],"sessionId":"session-1","requestId":"${requestId}"}\n\n`,
        ),
      );
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "action", action })}\n\n`),
      );
      controller.enqueue(
        encoder.encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n'),
      );
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

/**
 * The consume loop exactly as OllamaChat runs it: publish an action only while
 * this turn is still the authoritative one. A source assertion below pins that
 * the component really does this, so this cannot drift into testing a copy.
 */
async function runTurn(
  sequencer: ReturnType<typeof createChatTurnSequencer>,
  turnId: string,
  messages: { role: "user"; content: string }[],
): Promise<{ deltas: string[] }> {
  const deltas: string[] = [];
  for await (const event of streamChat(
    messages,
    undefined,
    "session-1",
    false,
    turnId,
  )) {
    if (event.kind === "action") {
      if (!sequencer.isAuthoritative(turnId)) continue;
      botActionBus.publish(event.action);
      continue;
    }
    if (event.kind === "delta") deltas.push(event.text);
  }
  return { deltas };
}

const FILTER_ACTION: BotAction = {
  type: "filter_inventory",
  filters: { make: "BMW" },
} as BotAction;

const NAVIGATE_ACTION: BotAction = {
  type: "navigate-target",
  targetKey: "vehicle-detail",
  params: { vehicleId: "11111111-1111-4111-8111-111111111111" },
} as BotAction;

describe("stale SSE actions cannot mutate the site", () => {
  it("executes the action of a normal single turn", () => {
    // The guard must not break the ordinary case it is protecting.
    const received: BotAction[] = [];
    botActionBus.onAny((action) => received.push(action));
    const sequencer = createChatTurnSequencer();
    const turnId = newChatRequestId();
    sequencer.begin(turnId);

    vi.stubGlobal("fetch", async () =>
      new Response(sseStream(FILTER_ACTION, turnId), { status: 200 }),
    );

    return runTurn(sequencer, turnId, [{ role: "user", content: "any BMWs?" }]).then(
      ({ deltas }) => {
        expect(received).toHaveLength(1);
        expect(received[0]!.type).toBe("filter_inventory");
        expect(deltas).toEqual(["ok"]);
      },
    );
  });

  it("ignores a filter_inventory from a turn a newer turn superseded", async () => {
    const received: BotAction[] = [];
    botActionBus.onAny((action) => received.push(action));
    const sequencer = createChatTurnSequencer();
    const staleTurnId = newChatRequestId();
    sequencer.begin(staleTurnId);
    // The visitor asked something else; that turn is now the current one.
    sequencer.begin(newChatRequestId());

    vi.stubGlobal("fetch", async () =>
      new Response(sseStream(FILTER_ACTION, staleTurnId), { status: 200 }),
    );

    const { deltas } = await runTurn(sequencer, staleTurnId, [
      { role: "user", content: "any BMWs?" },
    ]);

    expect(received).toHaveLength(0);
    // The prose still arrived; only site mutation is withheld.
    expect(deltas).toEqual(["ok"]);
  });

  it("ignores a navigate-target from a stream that resolves after an abort", async () => {
    // Aborting the fetch does not stop an already-buffered action from
    // surfacing, so navigation has to be refused on the turn's authority.
    const received: BotAction[] = [];
    botActionBus.onAny((action) => received.push(action));
    const sequencer = createChatTurnSequencer();
    const turnId = newChatRequestId();
    sequencer.begin(turnId);
    sequencer.abandon(turnId);

    vi.stubGlobal("fetch", async () =>
      new Response(sseStream(NAVIGATE_ACTION, turnId), { status: 200 }),
    );

    await runTurn(sequencer, turnId, [{ role: "user", content: "open it" }]);
    expect(received).toHaveLength(0);
  });

  it("keeps two chat surfaces from interfering with each other", async () => {
    const received: BotAction[] = [];
    botActionBus.onAny((action) => received.push(action));
    const tabA = createChatTurnSequencer();
    const tabB = createChatTurnSequencer();
    const turnA = newChatRequestId();
    const turnB = newChatRequestId();
    tabA.begin(turnA);
    tabB.begin(turnB);

    vi.stubGlobal("fetch", async () =>
      new Response(sseStream(FILTER_ACTION, turnA), { status: 200 }),
    );
    await runTurn(tabA, turnA, [{ role: "user", content: "any BMWs?" }]);

    // B starting a turn does not revoke A's, because they are separate.
    expect(received).toHaveLength(1);
    expect(tabB.isAuthoritative(turnB)).toBe(true);
  });

  it("sends the turn id and reports the one the server echoed", async () => {
    const turnId = newChatRequestId();
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(sseStream(FILTER_ACTION, turnId), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetcher);

    const events = [];
    for await (const event of streamChat(
      [{ role: "user", content: "hi" }],
      undefined,
      "session-1",
      false,
      turnId,
    )) {
      events.push(event);
    }

    const body = JSON.parse(String(fetcher.mock.calls[0]![1]?.body));
    expect(body.requestId).toBe(turnId);
    expect(events[0]).toMatchObject({ kind: "meta", requestId: turnId });
  });

  it("omits the turn id entirely when the caller supplies none", async () => {
    // Backwards compatibility: the server generates its own fallback.
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(sseStream(FILTER_ACTION, "x"), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetcher);
    for await (const _ of streamChat([{ role: "user", content: "hi" }])) {
      // drain
    }
    const body = JSON.parse(String(fetcher.mock.calls[0]![1]?.body));
    expect(body).not.toHaveProperty("requestId");
  });
});

describe("duplicate in-flight turns reach the client safely", () => {
  function duplicateStream(): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"duplicate"}\n\n'));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
  }

  it("surfaces a duplicate as its own outcome, not an error", async () => {
    // Throwing here would render "chat failed" for a turn that is being
    // answered by the delivery holding the lease.
    vi.stubGlobal("fetch", async () =>
      new Response(duplicateStream(), { status: 200 }),
    );
    const events = [];
    for await (const event of streamChat(
      [{ role: "user", content: "hi" }],
      undefined,
      "session-1",
      false,
      newChatRequestId(),
    )) {
      events.push(event);
    }
    expect(events).toEqual([{ kind: "duplicate" }]);
  });

  it("produces no assistant text for the duplicate delivery", async () => {
    // The visitor must not see the same reply twice.
    vi.stubGlobal("fetch", async () =>
      new Response(duplicateStream(), { status: 200 }),
    );
    const deltas = [];
    for await (const event of streamChat([{ role: "user", content: "hi" }])) {
      if (event.kind === "delta") deltas.push(event.text);
    }
    expect(deltas).toEqual([]);
  });

  it("executes no action from a duplicate delivery", async () => {
    const received: BotAction[] = [];
    botActionBus.onAny((action) => received.push(action));
    const sequencer = createChatTurnSequencer();
    const turnId = newChatRequestId();
    sequencer.begin(turnId);

    vi.stubGlobal("fetch", async () =>
      new Response(duplicateStream(), { status: 200 }),
    );
    await runTurn(sequencer, turnId, [{ role: "user", content: "hi" }]);
    expect(received).toHaveLength(0);
  });

  it("ends the stream at the duplicate event", async () => {
    // Anything the server sent afterwards would belong to a turn this
    // delivery is not answering.
    const encoder = new TextEncoder();
    vi.stubGlobal("fetch", async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"type":"duplicate"}\n\n'));
            controller.enqueue(
              encoder.encode('data: {"choices":[{"delta":{"content":"leaked"}}]}\n\n'),
            );
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          },
        }),
        { status: 200 },
      ),
    );
    const events = [];
    for await (const event of streamChat([{ role: "user", content: "hi" }])) {
      events.push(event);
    }
    expect(events).toEqual([{ kind: "duplicate" }]);
  });
});

describe("the chat component actually applies the guard", () => {
  // The integration tests above mirror the component's loop. This pins that
  // the component has not drifted away from the behaviour they assert.
  const component = readFileSync(
    resolve(process.cwd(), "src/components/chat/OllamaChat.tsx"),
    "utf8",
  );

  it("gates the action bus on the turn being authoritative", () => {
    const publish = component.indexOf("botActionBus.publish(event.action)");
    expect(publish).toBeGreaterThan(-1);
    const preceding = component.slice(Math.max(0, publish - 600), publish);
    expect(preceding).toContain("isAuthoritative(turnRequestId)");
  });

  it("generates one turn id per send and passes it to the stream", () => {
    expect(component).toContain("const turnRequestId = newChatRequestId()");
    expect(component).toContain("turnSequencerRef.current.begin(turnRequestId)");
    // The turn id is the stream's requestId argument (a timing observer may
    // follow it).
    expect(component).toMatch(
      /streamChat\(\s*messages,\s*abortController\.signal,\s*sessionId \?\? undefined,\s*startNewSession,\s*turnRequestId,/,
    );
  });

  it("ends a duplicate turn quietly instead of showing a failure", () => {
    expect(component).toContain('event.kind === "duplicate"');
    const branch = component.indexOf('event.kind === "duplicate"');
    const body = component.slice(branch, branch + 400);
    expect(body).toContain("duplicateTurn = true");
    // No error state is set for an expected duplicate.
    expect(body).not.toContain("setError");
  });

  it("inserts no assistant message for a duplicate turn", () => {
    const guard = component.indexOf("if (duplicateTurn) {");
    expect(guard).toBeGreaterThan(-1);
    // The early return sits before the message is finalised, and the finally
    // block still clears the pending/sending state.
    const finalise = component.indexOf("content: m.content.trim()");
    expect(guard).toBeLessThan(finalise);
  });

  it("revokes the turn when the chat resets or unmounts", () => {
    const resets = component.split("abandon(").length - 1;
    expect(resets).toBeGreaterThanOrEqual(2);
  });
});
