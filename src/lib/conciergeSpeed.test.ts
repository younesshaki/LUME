import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BotAction } from "@lume/types";
import {
  ACTION_TIMEOUT_MS,
  ClientTurnTimer,
  captureConciergeSpeedEvent,
  configureConciergeSpeedForTests,
  expectedDestination,
  noteConciergeActionDispatched,
  noteConciergeDestinationReady,
  noteConciergeRouteRendered,
} from "./conciergeSpeed";

type Captured = { name: string; properties: Record<string, unknown> };

let now = 0;
let path = "/home";
let captured: Captured[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  // afterNextPaint uses two rAFs; drive them with the fake timers.
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(now), 16),
  );
  now = 0;
  path = "/home";
  captured = [];
  configureConciergeSpeedForTests({
    now: () => now,
    capture: (name, properties) => captured.push({ name, properties }),
    path: () => path,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const paint = () => vi.advanceTimersByTime(40);

describe("ClientTurnTimer", () => {
  it("records each visitor-perceptible milestone once, from the press", () => {
    const timer = new ClientTurnTimer(() => now);
    now = 3;
    timer.mark("request_sent");
    now = 280;
    timer.mark("response_headers");
    timer.mark("first_event");
    now = 900;
    timer.mark("request_sent");
    timer.mark("done");
    expect(timer.properties()).toMatchObject({
      client_request_sent_ms: 3,
      client_response_headers_ms: 280,
      client_first_event_ms: 280,
      client_done_ms: 900,
    });
  });

  it("marks paint milestones only after a frame was produced", () => {
    const timer = new ClientTurnTimer(() => now);
    now = 300;
    timer.markAfterPaint("first_text_painted");
    expect(timer.properties().client_first_text_painted_ms).toBeUndefined();
    now = 332;
    paint();
    expect(timer.properties().client_first_text_painted_ms).toBe(332);
  });

  it("merges the server stage timings and derives the network overhead", () => {
    const timer = new ClientTurnTimer(() => now);
    now = 5;
    timer.mark("request_sent");
    now = 405;
    timer.mark("first_event");
    timer.setServerTiming({
      request_id: "r1",
      route: "deterministic",
      server_first_byte_ms: 260,
      server_total_ms: 262,
    });
    expect(timer.properties()).toMatchObject({
      server_route: "deterministic",
      server_request_id: "r1",
      server_first_byte_ms: 260,
      // 405 - 5 - 260: network, TLS, proxy hop, cold start.
      client_network_overhead_ms: 140,
    });
  });

  it("accepts only numeric server_*_ms fields and the two ids", () => {
    const timer = new ClientTurnTimer(() => now);
    timer.setServerTiming({
      server_first_byte_ms: 10,
      server_evil_ms: "<script>",
      user_message: "my phone number",
      route: "model",
      nested: { server_x_ms: 1 },
    });
    const properties = timer.properties();
    expect(properties.server_first_byte_ms).toBe(10);
    expect(properties).not.toHaveProperty("server_evil_ms");
    expect(properties).not.toHaveProperty("user_message");
    expect(properties).not.toHaveProperty("nested");
  });

  it("flags a turn during which the tab was hidden", () => {
    const timer = new ClientTurnTimer(() => now);
    expect(timer.properties().client_was_hidden).toBe(false);
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(timer.properties().client_was_hidden).toBe(true);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    timer.dispose();
  });
});

describe("action → page shown", () => {
  const filter: BotAction = { type: "filter_inventory", make: "Porsche" };
  const vehicleDetail: BotAction = {
    type: "navigate-target",
    targetKey: "vehicle-detail",
    params: { vehicleId: "v1" },
  };

  it("times route paint and data ready for a filter action", () => {
    noteConciergeActionDispatched("turn-1", filter);
    now = 12;
    path = "/vehicles#vehicles?make=Porsche";
    noteConciergeRouteRendered(path);
    now = 30;
    paint();
    now = 350;
    noteConciergeDestinationReady("inventory", true);
    paint();
    expect(captured).toEqual([
      {
        name: "lume_concierge_action_applied",
        properties: expect.objectContaining({
          turn_id: "turn-1",
          action_type: "filter_inventory",
          outcome: "ready",
          route_changed: true,
          action_route_ms: 30,
          action_ready_ms: 350,
        }),
      },
    ]);
  });

  it("ignores the page being left finishing its own load", () => {
    noteConciergeActionDispatched("turn-1", vehicleDetail);
    // Still on the start page: its inventory load completes.
    noteConciergeDestinationReady("inventory", true);
    paint();
    expect(captured).toEqual([]);
  });

  it("ignores data from the wrong kind of destination", () => {
    noteConciergeActionDispatched("turn-1", vehicleDetail);
    path = "/vehicles/v1";
    noteConciergeRouteRendered(path);
    paint();
    noteConciergeDestinationReady("inventory", true);
    paint();
    expect(captured).toEqual([]);
    noteConciergeDestinationReady("vehicle", true);
    paint();
    expect(captured[0]?.properties).toMatchObject({ outcome: "ready", action_type: "navigate-target" });
  });

  it("a destination without data ends at the painted route", () => {
    noteConciergeActionDispatched("turn-1", { type: "navigate", route: "/contact" });
    now = 20;
    path = "/contact";
    noteConciergeRouteRendered(path);
    paint();
    expect(captured[0]?.properties).toMatchObject({ outcome: "route_only", route_changed: true });
  });

  it("reports a timeout instead of waiting forever", () => {
    noteConciergeActionDispatched("turn-1", filter);
    vi.advanceTimersByTime(ACTION_TIMEOUT_MS + 1);
    expect(captured[0]?.properties).toMatchObject({
      outcome: "timeout",
      route_changed: false,
      action_ready_ms: null,
    });
  });

  it("a newer action supersedes an unfinished one", () => {
    noteConciergeActionDispatched("turn-1", filter);
    noteConciergeActionDispatched("turn-2", vehicleDetail);
    expect(captured[0]?.properties).toMatchObject({ turn_id: "turn-1", outcome: "superseded" });
  });

  it("does not time actions that do not change the page", () => {
    noteConciergeActionDispatched("turn-1", {
      type: "capture_lead",
      contact: { email: "a@b.c" },
    });
    vi.advanceTimersByTime(ACTION_TIMEOUT_MS + 1);
    expect(captured).toEqual([]);
  });

  it("knows each action's expected destination", () => {
    expect(expectedDestination(filter)).toBe("inventory");
    expect(expectedDestination(vehicleDetail)).toBe("vehicle");
    expect(expectedDestination({ type: "navigate", route: "/vehicles/abc" })).toBe("vehicle");
    expect(expectedDestination({ type: "navigate", route: "/contact" })).toBeNull();
    expect(expectedDestination({ type: "navigate-back", destination: "previous" })).toBe("any");
  });
});

describe("captureConciergeSpeedEvent", () => {
  it("feeds the test probe only when a test installed it", () => {
    captureConciergeSpeedEvent("lume_concierge_turn_completed", { duration_ms: 5 });
    expect((globalThis as { __lumeSpeedProbe?: unknown }).__lumeSpeedProbe).toBeUndefined();
    const probe: unknown[] = [];
    (globalThis as { __lumeSpeedProbe?: unknown }).__lumeSpeedProbe = probe;
    captureConciergeSpeedEvent("lume_concierge_turn_completed", { duration_ms: 7 });
    expect(probe).toEqual([{ name: "lume_concierge_turn_completed", properties: { duration_ms: 7 } }]);
    delete (globalThis as { __lumeSpeedProbe?: unknown }).__lumeSpeedProbe;
  });

  it("never throws even if the analytics sink does", () => {
    configureConciergeSpeedForTests({
      capture: () => {
        throw new Error("sink down");
      },
    });
    expect(() => captureConciergeSpeedEvent("x", {})).not.toThrow();
  });
});
