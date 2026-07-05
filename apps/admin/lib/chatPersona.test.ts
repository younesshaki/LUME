import { describe, expect, it } from "vitest";
import type { BotAction, BotPersona } from "@lume/types";
import {
  actionSystemPrompt,
  filterAllowedActions,
  isActionAllowed,
  personaBasePrompt,
} from "./chatPersona";
import { DEFAULT_BOT_PERSONA_CAPABILITIES, defaultPersona } from "./persona";

function persona(overrides: Partial<BotPersona> = {}): BotPersona {
  return { ...defaultPersona("t1"), ...overrides };
}

describe("personaBasePrompt", () => {
  it("uses persona name, tone instruction and tenant name", () => {
    const prompt = personaBasePrompt(
      persona({ name: "Aria", tone: "concise" }),
      "Atlas Motors"
    );
    expect(prompt).toContain("You are Aria, the AI concierge for Atlas Motors.");
    expect(prompt).toContain("Be brief and direct.");
  });

  it("always appends grounding rules, even with a custom system prompt", () => {
    const prompt = personaBasePrompt(
      persona({ systemPrompt: "Sell aggressively." }),
      "X"
    );
    expect(prompt).toContain("Sell aggressively.");
    expect(prompt).toContain("Grounding rules:");
    expect(prompt).toContain("TOTAL MATCHING");
  });

  it("omits an empty system prompt line", () => {
    const prompt = personaBasePrompt(persona({ systemPrompt: "  " }), "X");
    expect(prompt.split("\n").some((line) => line.trim() === "")).toBe(false);
  });
});

describe("actionSystemPrompt", () => {
  it("advertises all shapes for default capabilities", () => {
    const prompt = actionSystemPrompt(DEFAULT_BOT_PERSONA_CAPABILITIES);
    for (const type of [
      "filter_inventory",
      "navigate",
      "highlight-vehicle",
      "open-lead-form",
      "capture_lead",
      "scroll-to",
    ]) {
      expect(prompt).toContain(`"type":"${type}"`);
    }
  });

  it("drops shapes whose capability is disabled", () => {
    const prompt = actionSystemPrompt({
      ...DEFAULT_BOT_PERSONA_CAPABILITIES,
      captureLead: false,
      navigate: false,
    });
    expect(prompt).not.toContain(`"type":"capture_lead"`);
    expect(prompt).not.toContain(`"type":"navigate"`);
    expect(prompt).toContain(`"type":"filter_inventory"`);
  });
});

describe("isActionAllowed / filterAllowedActions", () => {
  const filterAction: BotAction = { type: "filter_inventory", make: "Porsche" };
  const leadAction: BotAction = {
    type: "capture_lead",
    contact: { email: "a@b.c" },
  };
  const highlightAction: BotAction = { type: "highlight-vehicle", vehicleId: "v1" };

  it("enforces capability gates", () => {
    const caps = { ...DEFAULT_BOT_PERSONA_CAPABILITIES, captureLead: false };
    expect(isActionAllowed(filterAction, caps)).toBe(true);
    expect(isActionAllowed(leadAction, caps)).toBe(false);
  });

  it("ungated actions are always allowed", () => {
    const caps = {
      navigate: false,
      filterInventory: false,
      openLeadForm: false,
      captureLead: false,
      scheduleAppointment: false,
    };
    expect(isActionAllowed(highlightAction, caps)).toBe(true);
  });

  it("filters lists in order", () => {
    const caps = { ...DEFAULT_BOT_PERSONA_CAPABILITIES, filterInventory: false };
    expect(filterAllowedActions([filterAction, leadAction, highlightAction], caps)).toEqual([
      leadAction,
      highlightAction,
    ]);
  });
});
