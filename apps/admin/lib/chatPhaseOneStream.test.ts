import { describe, expect, it } from "vitest";
import { PhaseOneStreamAccumulator } from "./chatPhaseOneStream";

describe("PhaseOneStreamAccumulator", () => {
  it("joins content and terminal usage from OpenAI-compatible SSE", () => {
    const accumulator = new PhaseOneStreamAccumulator();
    expect(accumulator.pushSseLine('data: {"choices":[{"delta":{"content":"Hello"}}]}'))
      .toEqual({ contentDelta: "Hello", completed: false });
    accumulator.pushSseLine('data: {"choices":[{"delta":{"content":" there"}}]}');
    accumulator.pushSseLine('data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":3}}');
    expect(accumulator.pushSseLine("data: [DONE]")).toEqual({ completed: true });
    expect(accumulator.message()).toEqual({
      content: "Hello there",
      reasoningContent: null,
      toolCalls: [],
      usage: { inputTokens: 12, outputTokens: 3 },
    });
  });

  it("reassembles interleaved streamed tool call deltas in index order", () => {
    const accumulator = new PhaseOneStreamAccumulator();
    accumulator.pushSseLine('data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call-b","type":"function","function":{"name":"get_","arguments":"{\\\"id\\\":\\\""}},{"index":0,"id":"call-a","type":"function","function":{"name":"find_","arguments":"{\\\"make\\\":\\\"B"}}]}}]}');
    accumulator.pushSseLine('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"vehicles","arguments":"MW\\\"}"}},{"index":1,"function":{"name":"vehicle","arguments":"v1\\\"}"}}]}}]}');
    expect(accumulator.message()).toMatchObject({
      toolCalls: [
        { id: "call-a", type: "function", function: { name: "find_vehicles", arguments: '{"make":"BMW"}' } },
        { id: "call-b", type: "function", function: { name: "get_vehicle", arguments: '{"id":"v1"}' } },
      ],
    });
  });

  it("keeps reasoning private while retaining it for a required tool follow-up", () => {
    const accumulator = new PhaseOneStreamAccumulator();
    accumulator.pushSseLine('data: {"choices":[{"delta":{"reasoning_content":"checking "}}]}');
    accumulator.pushSseLine('data: {"choices":[{"delta":{"reasoning_content":"inventory"}}]}');
    expect(accumulator.message().reasoningContent).toBe("checking inventory");
  });

  it("ignores malformed events and refuses an unbounded tool-call index", () => {
    const accumulator = new PhaseOneStreamAccumulator();
    accumulator.pushSseLine("data: not-json");
    accumulator.pushSseLine('data: {"choices":[{"delta":{"tool_calls":[{"index":99,"function":{"name":"bad","arguments":"{}"}}]}}]}');
    expect(accumulator.message().toolCalls).toEqual([]);
  });
});
