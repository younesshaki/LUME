import { describe, expect, it } from "vitest";
import { buildConciergeTurnRecord } from "./observability";

/**
 * The turn record is emitted on every request, with no debug flag in front of
 * it. These tests are the safety case for that: they pin what the record may
 * contain, and — more importantly — what it can never contain.
 */
const base = {
  surface: "public" as const,
  requestId: "req-1",
  tenantId: "tenant-1",
  route: "deterministic" as const,
  now: () => 1_760_000_000_000,
};

describe("concierge turn telemetry: usage and cost honesty", () => {
  it("reports unknown, not zero, when the provider returned no usage block", () => {
    // A zero here would read as "this turn was free" in a spend report. The
    // distinction between "cost nothing" and "we don't know" has to survive.
    const record = buildConciergeTurnRecord({ ...base, route: "model" });
    expect(record.usage).toEqual({
      inputTokens: null,
      outputTokens: null,
      source: "unknown",
    });
  });

  it("keeps a genuine zero-token count distinguishable from an absent one", () => {
    const record = buildConciergeTurnRecord({
      ...base,
      route: "model",
      usage: { inputTokens: 700, outputTokens: 0 },
    });
    expect(record.usage.outputTokens).toBe(0);
    expect(record.usage.source).toBe("provider");
  });

  it("marks an estimate as estimated rather than passing it off as measured", () => {
    const record = buildConciergeTurnRecord({
      ...base,
      route: "model",
      usage: { inputTokens: 500, outputTokens: 120, source: "estimated" },
    });
    expect(record.usage.source).toBe("estimated");
  });

  it("refuses to price a turn when no price table was supplied", () => {
    // LUME has no owner-approved rate table yet. Inventing one would produce
    // confident, wrong spend figures, which is worse than none.
    const record = buildConciergeTurnRecord({
      ...base,
      route: "model",
      usage: { inputTokens: 1000, outputTokens: 500 },
    });
    expect(record.cost).toEqual({
      usd: null,
      source: "unpriced",
      priceTableVersion: null,
    });
  });

  it("prices a turn only when rates and counts are both present", () => {
    const record = buildConciergeTurnRecord({
      ...base,
      route: "model",
      usage: { inputTokens: 2000, outputTokens: 1000 },
      price: { inputPer1k: 0.5, outputPer1k: 1.5, tableVersion: "test-v1" },
    });
    expect(record.cost.usd).toBeCloseTo(2 * 0.5 + 1 * 1.5, 10);
    expect(record.cost.source).toBe("priced");
    expect(record.cost.priceTableVersion).toBe("test-v1");
  });

  it("stays unpriced when rates exist but usage is unknown", () => {
    const record = buildConciergeTurnRecord({
      ...base,
      route: "model",
      price: { inputPer1k: 0.5, outputPer1k: 1.5, tableVersion: "test-v1" },
    });
    expect(record.cost.usd).toBeNull();
    expect(record.cost.source).toBe("unpriced");
  });

  it("records no model block for a turn the model never saw", () => {
    // The headline metric of the deterministic-first design.
    const record = buildConciergeTurnRecord({ ...base, model: null });
    expect(record.model).toBeNull();
    expect(record.route).toBe("deterministic");
  });
});

describe("concierge turn telemetry: redaction contract", () => {
  it("has no field capable of carrying visitor or model content", () => {
    const record = buildConciergeTurnRecord({
      ...base,
      route: "tool",
      ruleCodes: ["replace_search"],
      query: { status: "success", totalCount: 9 },
      actions: { emitted: ["filter_inventory"], dropped: ["navigate-target"] },
      model: {
        provider: "deepseek",
        requestedModelId: "a",
        effectiveModelId: "b",
      },
    });
    const serialized = JSON.stringify(record).toLowerCase();
    for (const forbidden of [
      "usertext",
      "assistanttext",
      "message",
      "prompt",
      "completion",
      "content",
      "reasoning",
      "email",
      "phone",
      "apikey",
      "authorization",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("records action types but never action params", () => {
    // Params carry vehicle ids; those belong in the debug-gated line.
    const record = buildConciergeTurnRecord({
      ...base,
      actions: { emitted: ["navigate-target"] },
    });
    expect(record.actions.emitted).toEqual(["navigate-target"]);
    expect(JSON.stringify(record)).not.toContain("params");
  });

  it("bounds rule codes and action lists so one turn cannot flood the log", () => {
    const record = buildConciergeTurnRecord({
      ...base,
      ruleCodes: Array.from({ length: 200 }, (_, i) => `rule_${i}`),
      actions: {
        emitted: Array.from({ length: 200 }, () => "filter_inventory"),
        dropped: Array.from({ length: 200 }, () => "navigate-target"),
      },
    });
    expect(record.ruleCodes.length).toBeLessThanOrEqual(20);
    expect(record.actions.emitted.length).toBeLessThanOrEqual(20);
    expect(record.actions.dropped.length).toBeLessThanOrEqual(20);
  });

  it("clamps an over-long rule code instead of logging it whole", () => {
    const record = buildConciergeTurnRecord({
      ...base,
      ruleCodes: ["x".repeat(500)],
    });
    expect(record.ruleCodes[0]!.length).toBeLessThanOrEqual(60);
  });
});

describe("concierge turn telemetry: defaults", () => {
  it("defaults a turn with no query to not_run rather than empty", () => {
    // "not_run" and "empty" mean different things: one is an ordinal turn,
    // the other is a real zero-result answer.
    const record = buildConciergeTurnRecord(base);
    expect(record.query).toEqual({ status: "not_run", totalCount: null });
  });

  it("normalizes non-finite timings to null", () => {
    const record = buildConciergeTurnRecord({
      ...base,
      timingsMs: { state: Number.NaN, total: 120 },
    });
    expect(record.timingsMs.state).toBeNull();
    expect(record.timingsMs.total).toBe(120);
  });

  it("carries the correlation ids needed to join the debug lines", () => {
    const record = buildConciergeTurnRecord({
      ...base,
      conversationId: "session-1",
      turn: 4,
    });
    expect(record.requestId).toBe("req-1");
    expect(record.conversationId).toBe("session-1");
    expect(record.turn).toBe(4);
    expect(record.scope).toBe("concierge.turn");
  });
});
