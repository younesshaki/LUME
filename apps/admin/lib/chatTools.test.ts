import { describe, expect, it } from "vitest";
import type { ToolSpec } from "@lume/bot";
import {
  buildToolRequestFields,
  resolveTenantBotRuntimeConfig,
  resolveTenantToolAllowlist,
} from "./chatTools";

describe("tenant chat tools", () => {
  it("distinguishes legacy missing rows from explicit deny-all", () => {
    expect(resolveTenantToolAllowlist(null, null)).toBeUndefined();
    expect(resolveTenantToolAllowlist({ allowed_tools: [] }, null)).toEqual([]);
  });

  it("fails closed on query or malformed configuration", () => {
    expect(resolveTenantToolAllowlist(null, new Error("unavailable"))).toEqual([]);
    expect(resolveTenantToolAllowlist({ allowed_tools: "find_vehicles" }, null)).toEqual([]);
  });

  it("retains string names for registry filtering", () => {
    expect(resolveTenantToolAllowlist(
      { allowed_tools: ["find_vehicles", 42, "unknown"] },
      null,
    )).toEqual(["find_vehicles", "unknown"]);
  });

  it("loads the model and tool policy from one tenant configuration row", () => {
    expect(
      resolveTenantBotRuntimeConfig(
        {
          allowed_tools: ["find_vehicles"],
          model: "kimi-k3",
        },
        null,
      ),
    ).toEqual({
      allowedTools: ["find_vehicles"],
      modelId: "kimi-k3",
    });
    expect(
      resolveTenantBotRuntimeConfig(
        {
          allowed_tools: ["find_vehicles"],
          model: "deepseek-chat",
        },
        null,
      ),
    ).toEqual({
      allowedTools: ["find_vehicles"],
      modelId: "deepseek-v4-flash",
    });
  });

  it("fails tool access closed while keeping a safe model fallback", () => {
    expect(resolveTenantBotRuntimeConfig(null, new Error("offline"))).toEqual({
      allowedTools: [],
      modelId: "deepseek-v4-flash",
    });
  });

  it("omits DeepSeek tool fields for an empty spec list", () => {
    expect(buildToolRequestFields([])).toEqual({});
    const spec: ToolSpec = {
      type: "function",
      function: { name: "find_vehicles", description: "Find", parameters: { type: "object" } },
    };
    expect(buildToolRequestFields([spec])).toEqual({ tools: [spec], tool_choice: "auto" });
  });
});
