// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ after: () => undefined }));
vi.mock("../../apps/admin/lib/posthog.server", () => ({
  captureConciergeOperationalEvent: async () => undefined,
}));

import { CLIENT_TURN_MARKS } from "../../src/lib/conciergeSpeed";
import {
  TURN_TIMING_MARKS,
  TURN_TIMING_SPANS,
} from "../../apps/admin/lib/conciergeTurnTiming";
// @ts-expect-error — plain .mjs script without type declarations.
import { DASHBOARD_NAME, buildSpeedInsights } from "./concierge-speed-dashboard.mjs";

type Insight = { name: string; description: string; query: unknown };

/** Every property name the speed events can carry. */
const EMITTED = new Set<string>([
  // browser turn event
  ...CLIENT_TURN_MARKS.map((mark) => `client_${mark}_ms`),
  "turn_id", "conversation_id", "conversation_turn", "response_started", "duration_ms",
  "action_count", "action_types", "response_chars", "client_network_overhead_ms",
  "client_was_hidden", "client_net_type", "client_net_rtt_ms", "client_net_downlink_mbps",
  "client_save_data", "client_cpu_cores", "client_device_memory_gb", "client_viewport",
  "client_release", "server_route", "server_request_id",
  // server stages (also merged into the browser event)
  ...TURN_TIMING_MARKS.map((mark) => `server_${mark}_ms`),
  ...TURN_TIMING_SPANS.map((span) => `server_${span}_ms`),
  "server_total_ms",
  // server event
  "request_id", "client_request_id", "turn", "route", "status", "error_stage",
  "model_provider", "model_id", "model_fell_back", "model_calls", "query_status",
  "result_count", "rule_codes", "memory_mode", "instance_turn", "cold_start", "region",
  "release", "deployment_env",
  // action event
  "action_type", "outcome", "route_changed", "action_route_ms", "action_ready_ms",
  // PostHog built-ins
  "$session_id",
]);

function referencedProperties(value: unknown, found = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    for (const match of value.matchAll(/properties\.([$a-z0-9_]+)/gi)) found.add(match[1]!);
    return found;
  }
  if (Array.isArray(value)) {
    for (const item of value) referencedProperties(item, found);
    return found;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["math_property", "breakdown"]) {
      if (typeof record[key] === "string") found.add(record[key] as string);
    }
    if (record.type === "event" && typeof record.key === "string") found.add(record.key);
    for (const child of Object.values(record)) referencedProperties(child, found);
  }
  return found;
}

describe("concierge speed dashboard definition", () => {
  const insights = buildSpeedInsights() as Insight[];

  it("has uniquely named, described insights (names are the idempotency key)", () => {
    const names = insights.map((insight) => insight.name);
    expect(new Set(names).size).toBe(names.length);
    for (const insight of insights) {
      expect(insight.name.startsWith("Speed · ")).toBe(true);
      expect(insight.description.length).toBeGreaterThan(10);
    }
    expect(DASHBOARD_NAME).toBe("LUME Concierge — Speed");
  });

  it("reads only properties the code actually emits", () => {
    for (const insight of insights) {
      for (const property of referencedProperties(insight.query)) {
        expect(EMITTED.has(property), `${insight.name}: ${property}`).toBe(true);
      }
    }
  });

  it("reads only the three speed events", () => {
    const serialized = JSON.stringify(insights);
    const events = new Set(
      [...serialized.matchAll(/lume_concierge_[a-z_]+/g)].map((match) => match[0]),
    );
    expect([...events].sort()).toEqual([
      "lume_concierge_action_applied",
      "lume_concierge_turn_completed",
      "lume_concierge_turn_timing",
    ]);
  });
});
