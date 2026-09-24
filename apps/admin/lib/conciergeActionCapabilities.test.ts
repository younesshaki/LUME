// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PUBLIC_CONCIERGE_ACTIONS,
  PUBLIC_CONCIERGE_ACTION_TYPES,
  PUBLIC_CONCIERGE_DEFERRED_ACTIONS,
  PUBLIC_CONCIERGE_RETIRED_ACTIONS,
  isServerAuthoredOnlyAction,
} from "@lume/types";
import { actionSystemPrompt, authorizableActionTypes } from "./chatPersona";
import { isBotAction, validateBotActionEnvelope } from "./botActions";
import { DEFAULT_BOT_PERSONA_CAPABILITIES } from "./persona";

/**
 * The capability contract: every live action is authorizable, validated and
 * consumed in the browser; nothing retired or deferred is accepted anywhere;
 * nothing server-only is ever shown to or accepted from the model.
 */
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const appSource = read("src/App.tsx");
const leadBridgeSource = read("src/lib/LeadCaptureBridge.tsx");
const browserValidator = read("src/lib/deepseekService.ts");

const ALL_CAPABILITIES_ON = {
  ...DEFAULT_BOT_PERSONA_CAPABILITIES,
  navigate: true,
  filterInventory: true,
  openLeadForm: true,
  captureLead: true,
};

describe("public concierge capability contract", () => {
  it("the persona gate can authorize exactly the live action types", () => {
    expect([...authorizableActionTypes()].sort()).toEqual(
      [...PUBLIC_CONCIERGE_ACTION_TYPES].sort(),
    );
  });

  it("every live action has a real browser consumer", () => {
    for (const type of PUBLIC_CONCIERGE_ACTION_TYPES) {
      const consumer = PUBLIC_CONCIERGE_ACTIONS[type].consumer;
      const source = consumer === "app-router" ? appSource : leadBridgeSource;
      expect(source, `${type} → ${consumer}`).toMatch(
        new RegExp(`useBotAction\\(\\s*"${type}"`),
      );
    }
  });

  it("the browser validator knows every live type", () => {
    for (const type of PUBLIC_CONCIERGE_ACTION_TYPES) {
      expect(browserValidator, type).toContain(`case "${type}":`);
    }
  });

  it("retired and deferred types are rejected by the server and the browser", () => {
    for (const type of [
      ...Object.keys(PUBLIC_CONCIERGE_RETIRED_ACTIONS),
      ...Object.keys(PUBLIC_CONCIERGE_DEFERRED_ACTIONS),
    ]) {
      expect(isBotAction({ type, sectionId: "x", contact: { email: "a@b.c" } }), type).toBe(false);
      expect(browserValidator, type).not.toContain(`case "${type}":`);
    }
  });

  it("never advertises a server-only, retired or deferred type to the model", () => {
    const prompt = actionSystemPrompt(ALL_CAPABILITIES_ON);
    const forbidden = [
      ...PUBLIC_CONCIERGE_ACTION_TYPES.filter(isServerAuthoredOnlyAction),
      ...Object.keys(PUBLIC_CONCIERGE_RETIRED_ACTIONS),
      ...Object.keys(PUBLIC_CONCIERGE_DEFERRED_ACTIONS),
    ];
    expect(forbidden).toContain("navigate-back");
    for (const type of forbidden) {
      expect(prompt, type).not.toContain(`"type":"${type}"`);
    }
  });

  it("/api/bot-actions cannot mint a server-authored action", () => {
    const result = validateBotActionEnvelope({
      action: { type: "navigate-back", destination: "previous" },
    });
    expect(result.ok).toBe(false);
  });

  it("navigate-back is registered as server-authored with a documented fallback", () => {
    expect(PUBLIC_CONCIERGE_ACTIONS["navigate-back"].origin).toBe("server");
    expect(PUBLIC_CONCIERGE_ACTIONS["navigate-back"].safeFallback).toMatch(/never off-site/);
  });
});
