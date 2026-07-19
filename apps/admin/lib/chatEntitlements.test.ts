import { describe, expect, it } from "vitest";
import type { BotAction } from "@lume/types";
import { BOT_TOOLS } from "@lume/bot";
import {
  CHAT_ACTIONS_DISABLED_CAPABILITIES,
  filterPlanAllowedActions,
  planEnabledTools,
} from "./chatEntitlements";
import { DEFAULT_BOT_PERSONA_CAPABILITIES } from "./persona";

const navigate: BotAction = { type: "navigate", route: "/vehicles" };
const scrollTo: BotAction = { type: "scroll-to", sectionId: "inventory" };
const openLeadForm: BotAction = { type: "open-lead-form" };

describe("planEnabledTools — Basic vs Pro tool access", () => {
  it("Basic (chat.actions off) advertises no tools at all", () => {
    expect(planEnabledTools(false, undefined)).toEqual([]);
    expect(planEnabledTools(false, ["find_vehicles"])).toEqual([]);
  });

  it("Pro (chat.actions on) with the legacy allowlist gets every registered tool", () => {
    const tools = planEnabledTools(true, undefined);
    expect(tools.map((tool) => tool.name)).toEqual(BOT_TOOLS.map((tool) => tool.name));
    expect(tools.length).toBeGreaterThan(0);
  });

  it("Pro with an explicit tenant allowlist gets only tools both entitled and tenant-enabled", () => {
    const tools = planEnabledTools(true, ["find_vehicles", "get_vehicle_details"]);
    expect(tools.map((tool) => tool.name)).toEqual(["find_vehicles", "get_vehicle_details"]);
  });

  it("Pro with an empty tenant allowlist gets nothing — empty never means unrestricted", () => {
    expect(planEnabledTools(true, [])).toEqual([]);
  });
});

describe("filterPlanAllowedActions — Basic vs Pro action access", () => {
  it("Basic drops every action, even ones persona capabilities would allow", () => {
    expect(filterPlanAllowedActions(false, [navigate, openLeadForm], DEFAULT_BOT_PERSONA_CAPABILITIES))
      .toEqual([]);
  });

  it("Basic also drops always-allowed shapes like scroll-to that capabilities alone would keep", () => {
    expect(filterPlanAllowedActions(false, [scrollTo], DEFAULT_BOT_PERSONA_CAPABILITIES))
      .toEqual([]);
  });

  it("Pro keeps actions the tenant persona allows", () => {
    expect(filterPlanAllowedActions(true, [navigate, scrollTo], DEFAULT_BOT_PERSONA_CAPABILITIES))
      .toEqual([navigate, scrollTo]);
  });

  it("Pro still respects persona capabilities as an additional restriction", () => {
    const capabilities = { ...DEFAULT_BOT_PERSONA_CAPABILITIES, navigate: false };
    expect(filterPlanAllowedActions(true, [navigate, openLeadForm], capabilities))
      .toEqual([openLeadForm]);
  });
});

describe("CHAT_ACTIONS_DISABLED_CAPABILITIES", () => {
  it("disables every gated persona capability for prompt assembly", () => {
    for (const value of Object.values(CHAT_ACTIONS_DISABLED_CAPABILITIES)) {
      expect(value).toBe(false);
    }
  });
});
