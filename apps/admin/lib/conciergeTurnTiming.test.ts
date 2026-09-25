// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => [] as Array<{ event: string; properties: Record<string, unknown> }>);
vi.mock("next/server", () => ({
  // Outside a request scope Next throws; the helper must fall back to sending.
  after: () => {
    throw new Error("after() called outside a request scope");
  },
}));
vi.mock("./posthog.server", () => ({
  captureConciergeOperationalEvent: async (input: { event: string; properties: Record<string, unknown> }) => {
    captured.push({ event: input.event, properties: input.properties });
  },
}));

import {
  TURN_TIMING_MARKS,
  TURN_TIMING_SPANS,
  TurnStopwatch,
  buildClientTurnTiming,
  buildTurnTimingProperties,
  nextInstanceTurn,
  queueTurnTimingEvent,
  resetInstanceTurnsForTests,
  type TurnTimingContext,
} from "./conciergeTurnTiming";

function fakeClock(start = 1_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

const CONTEXT: TurnTimingContext = {
  requestId: "11111111-1111-4111-8111-111111111111",
  clientRequestId: true,
  tenantId: "tenant-1",
  conversationId: "conversation-1",
  turn: 3,
  route: "deterministic",
  queryStatus: "success",
  resultCount: 10,
  actionTypes: ["filter_inventory"],
  ruleCodes: ["start_new_inventory_search"],
  memoryMode: "local",
  instanceTurn: 4,
};

beforeEach(() => {
  captured.length = 0;
  resetInstanceTurnsForTests();
});

describe("TurnStopwatch", () => {
  it("records each stage the first time it is reached", () => {
    const clock = fakeClock();
    const timing = new TurnStopwatch(clock.now);
    clock.advance(40);
    timing.mark("tenant");
    clock.advance(60);
    timing.mark("tenant");
    timing.mark("quota");
    expect(timing.snapshot().marks).toEqual({ tenant: 40, quota: 100 });
  });

  it("accumulates repeated spans and survives a failing unit of work", async () => {
    const clock = fakeClock();
    const timing = new TurnStopwatch(clock.now);
    await timing.span("inventory_query", async () => clock.advance(30));
    await expect(
      timing.span("inventory_query", async () => {
        clock.advance(20);
        throw new Error("query failed");
      }),
    ).rejects.toThrow("query failed");
    expect(timing.snapshot().spans.inventory_query).toBe(50);
  });

  it("ignores impossible span values", () => {
    const timing = new TurnStopwatch(fakeClock().now);
    timing.addSpan("tools", Number.NaN);
    timing.addSpan("tools", -5);
    expect(timing.snapshot().spans).toEqual({});
  });
});

describe("buildTurnTimingProperties", () => {
  it("emits every stage as a flat server_*_ms number", () => {
    const properties = buildTurnTimingProperties(
      CONTEXT,
      {
        marks: { tenant: 80, state: 250, first_byte: 260, done: 262 },
        spans: { inventory_query: 85 },
      },
      262,
      {},
    );
    expect(properties).toMatchObject({
      server_tenant_ms: 80,
      server_state_ms: 250,
      server_first_byte_ms: 260,
      server_done_ms: 262,
      server_inventory_query_ms: 85,
      server_total_ms: 262,
      route: "deterministic",
      action_types: "filter_inventory",
      action_count: 1,
      cold_start: false,
      instance_turn: 4,
      release: "local",
      deployment_env: "development",
    });
  });

  it("is content-free: only scalar, allowlisted fields", () => {
    const properties = buildTurnTimingProperties(CONTEXT, { marks: {}, spans: {} }, 5, {});
    const allowed = new Set([
      "request_id", "client_request_id", "conversation_id", "turn", "route", "status",
      "error_stage", "model_provider", "model_id", "model_fell_back", "model_calls",
      "query_status", "result_count", "action_count", "action_types", "rule_codes",
      "memory_mode", "instance_turn", "cold_start", "region", "release",
      "deployment_env", "server_total_ms",
    ]);
    for (const [key, value] of Object.entries(properties)) {
      expect(allowed.has(key) || /^server_[a-z0-9_]+_ms$/.test(key), key).toBe(true);
      expect(["string", "number", "boolean"].includes(typeof value) || value === null, key).toBe(true);
    }
  });

  it("sanitises list fields so they can never carry free text", () => {
    const properties = buildTurnTimingProperties(
      { ...CONTEXT, ruleCodes: ["ok_rule", "drop <script>alert(1)</script> me please"] },
      { marks: {}, spans: {} },
      5,
      {},
    );
    expect(properties.rule_codes).toBe("ok_rule,dropscriptalert1scriptmeplease".slice(0, 56));
  });

  it("tags region, release and environment from the platform", () => {
    const properties = buildTurnTimingProperties(CONTEXT, { marks: {}, spans: {} }, 5, {
      VERCEL_REGION: "iad1",
      VERCEL_GIT_COMMIT_SHA: "abcdef1234567890",
      VERCEL_ENV: "production",
    });
    expect(properties).toMatchObject({
      region: "iad1",
      release: "abcdef123456",
      deployment_env: "production",
    });
  });

  it("marks the first turn on an instance as a cold start", () => {
    expect(nextInstanceTurn()).toBe(1);
    expect(nextInstanceTurn()).toBe(2);
    const cold = buildTurnTimingProperties({ ...CONTEXT, instanceTurn: 1 }, { marks: {}, spans: {} }, 1, {});
    expect(cold.cold_start).toBe(true);
  });

  it("names every declared mark and span", () => {
    const marks = Object.fromEntries(TURN_TIMING_MARKS.map((mark, index) => [mark, index]));
    const spans = Object.fromEntries(TURN_TIMING_SPANS.map((span, index) => [span, index]));
    const properties = buildTurnTimingProperties(CONTEXT, { marks, spans }, 1, {});
    for (const mark of TURN_TIMING_MARKS) expect(properties).toHaveProperty(`server_${mark}_ms`);
    for (const span of TURN_TIMING_SPANS) expect(properties).toHaveProperty(`server_${span}_ms`);
  });
});

describe("buildClientTurnTiming", () => {
  it("sends the browser only the request id, route and durations", () => {
    const payload = buildClientTurnTiming(
      CONTEXT,
      { marks: { first_byte: 12, done: 20 }, spans: { interpretation: 700 } },
      20,
    );
    expect(payload).toEqual({
      request_id: CONTEXT.requestId,
      route: "deterministic",
      server_total_ms: 20,
      server_first_byte_ms: 12,
      server_done_ms: 20,
      server_interpretation_ms: 700,
    });
  });
});

describe("queueTurnTimingEvent", () => {
  it("still sends when after() is unavailable, and never throws", async () => {
    expect(() => queueTurnTimingEvent("tenant-1", { route: "model" })).not.toThrow();
    await Promise.resolve();
    expect(captured).toEqual([
      { event: "lume_concierge_turn_timing", properties: { route: "model" } },
    ]);
  });
});
