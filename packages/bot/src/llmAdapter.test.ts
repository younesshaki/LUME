import { describe, expect, it } from "vitest";
import { parseToolCalls, toToolResultMessages } from "./llmAdapter";
import { runToolCalls } from "./runner";
import { fakeGetVehicleById, fakeQueryVehicles, makeVehicle } from "./testFixtures";

describe("parseToolCalls", () => {
  it("parses JSON string arguments into objects and keeps the id", () => {
    const calls = parseToolCalls([
      { id: "call_1", function: { name: "find_vehicles", arguments: '{"make":"Porsche"}' } },
    ]);
    expect(calls).toEqual([{ name: "find_vehicles", args: { make: "Porsche" }, id: "call_1" }]);
  });

  it("treats empty arguments as an empty object", () => {
    const calls = parseToolCalls([{ function: { name: "find_best_deal", arguments: "" } }]);
    expect(calls[0].args).toEqual({});
  });

  it("passes unparsable arguments through as a raw string (rejected by object schemas)", () => {
    const calls = parseToolCalls([
      { id: "x", function: { name: "find_vehicles", arguments: "{not json" } },
    ]);
    expect(calls[0].args).toBe("{not json");
  });

  it("returns an empty array for null/undefined input", () => {
    expect(parseToolCalls(null)).toEqual([]);
    expect(parseToolCalls(undefined)).toEqual([]);
  });
});

describe("end-to-end: parse → run → tool messages", () => {
  it("produces role:tool messages with parseable content", async () => {
    const vehicles = [makeVehicle({ id: "a", make: "Porsche" })];
    const ctx = {
      tenantId: "tenant-1",
      queryVehicles: fakeQueryVehicles(vehicles).fn,
      getVehicleById: fakeGetVehicleById(vehicles),
    };

    const calls = parseToolCalls([
      { id: "call_1", function: { name: "find_vehicles", arguments: '{"make":"Porsche"}' } },
    ]);
    const turn = await runToolCalls(calls, ctx);
    const messages = toToolResultMessages(turn.steps);

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("tool");
    expect(messages[0].tool_call_id).toBe("call_1");
    expect(messages[0].name).toBe("find_vehicles");

    const parsed = JSON.parse(messages[0].content) as { ok: boolean; summary: string };
    expect(parsed.ok).toBe(true);
    expect(parsed.summary).toMatch(/found 1 matching vehicle/i);
  });

  it("surfaces invalid_args for unparsable model arguments", async () => {
    const vehicles = [makeVehicle()];
    const ctx = { tenantId: "tenant-1", queryVehicles: fakeQueryVehicles(vehicles).fn };
    const calls = parseToolCalls([
      { id: "bad", function: { name: "find_vehicles", arguments: "{oops" } },
    ]);
    const turn = await runToolCalls(calls, ctx);
    expect(turn.ok).toBe(false);
    expect(turn.steps[0].result.error?.code).toBe("invalid_args");
  });
});
