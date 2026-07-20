import { describe, expect, it } from "vitest";
import type { LlmToolCall } from "@lume/bot";
import {
  assistantToolCallMessage,
  buildChatCompletionBody,
  normalizeProviderAssistantMessage,
} from "./chatProvider";
import { getConciergeModelProfile } from "./conciergeModels";

const TOOL_CALL: LlmToolCall = {
  id: "call_1",
  type: "function",
  function: {
    name: "find_vehicles",
    arguments: '{"make":"BMW"}',
  },
};

describe("chat provider compatibility", () => {
  it.each([
    "deepseek-v4-flash",
    "deepseek-v4-pro",
    "kimi-k2.6",
  ] as const)("uses bounded non-thinking mode for %s", (modelId) => {
    expect(
      buildChatCompletionBody({
        modelId,
        stream: false,
        messages: [{ role: "user", content: "Hello" }],
      }),
    ).toMatchObject({
      model: modelId,
      stream: false,
      thinking: { type: "disabled" },
    });
  });

  it("uses Kimi K3 maximum reasoning without unsupported thinking toggles", () => {
    const body = buildChatCompletionBody({
      modelId: "kimi-k3",
      stream: true,
      messages: [{ role: "user", content: "Compare these vehicles" }],
      toolFields: { tools: [{ type: "function" }], tool_choice: "auto" },
    });
    expect(body).toMatchObject({
      model: "kimi-k3",
      stream: true,
      reasoning_effort: "max",
      tool_choice: "auto",
    });
    expect(body).not.toHaveProperty("thinking");
  });

  it("accepts structured Kimi tool calls and preserves K3 reasoning for phase two", () => {
    const normalized = normalizeProviderAssistantMessage(
      getConciergeModelProfile("kimi-k3"),
      {
        content: "",
        reasoning_content: "private provider reasoning",
        tool_calls: [TOOL_CALL],
      },
      ["find_vehicles"],
    );
    expect(normalized.toolCalls).toEqual([TOOL_CALL]);
    expect(assistantToolCallMessage(normalized)).toEqual({
      role: "assistant",
      content: "",
      reasoning_content: "private provider reasoning",
      tool_calls: [TOOL_CALL],
    });
  });

  it("retains the contained DeepSeek DSML recovery only for DeepSeek", () => {
    const dsml = [
      "<｜｜DSML｜｜tool_calls>",
      '<｜｜DSML｜｜invoke name="find_vehicles">',
      '<｜｜DSML｜｜parameter name="make" string="true">BMW</｜｜DSML｜｜parameter>',
      "</｜｜DSML｜｜invoke>",
      "</｜｜DSML｜｜tool_calls>",
    ].join("\n");
    const deepseek = normalizeProviderAssistantMessage(
      getConciergeModelProfile("deepseek-v4-flash"),
      { content: dsml },
      ["find_vehicles"],
    );
    const kimi = normalizeProviderAssistantMessage(
      getConciergeModelProfile("kimi-k2.6"),
      { content: dsml },
      ["find_vehicles"],
    );
    expect(deepseek.toolCalls).toHaveLength(1);
    expect(deepseek.content).toBe("");
    expect(kimi.toolCalls).toEqual([]);
    expect(kimi.content).toBe(dsml);
  });
});
