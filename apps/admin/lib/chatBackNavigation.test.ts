// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { BotAction, BotInventoryFilterAction } from "@lume/types";
import {
  backNavigationReply,
  decideBackNavigation,
  detectBackNavigationRequest,
  isInventoryResultsPath,
  normalizeChatNavigationContext,
} from "./chatBackNavigation";
import {
  hasFullInventoryResetIntent,
  transitionInventoryState,
  normalizeConversationInventoryState,
} from "./chatConversationState";
import { filterModelNavigationActionsByUserIntent } from "./chatNavigation";
import { filterPlanAllowedActions } from "./chatEntitlements";
import { prepareBotActionsForClient } from "./conciergeTargets";
import { DEFAULT_BOT_PERSONA_CAPABILITIES } from "./persona";

const RESULTS: BotInventoryFilterAction = {
  type: "filter_inventory",
  make: "Porsche",
  sort: "price_desc",
  limit: 10,
};
const NO_HISTORY = { hasPrevious: false, hasResults: false };

describe("detectBackNavigationRequest", () => {
  it.each([
    ["go back", "previous"],
    ["Go back.", "previous"],
    ["take me back", "previous"],
    ["can you take me back please", "previous"],
    ["back", "previous"],
    ["previous page", "previous"],
    ["go back to the previous page", "previous"],
    ["take me back to where I was", "previous"],
    ["return to the results", "results"],
    ["back to the cars", "results"],
    ["go back to the results", "results"],
    ["take me back to my search results please", "results"],
    ["back to the listings", "results"],
  ])("%j → %s", (text, destination) => {
    expect(detectBackNavigationRequest(text)).toEqual({ destination });
  });

  it.each([
    // Inventory resets keep their existing meaning.
    "back to full inventory",
    "back to the whole inventory",
    "show all inventory",
    "clear my filters",
    "back to all cars",
    // New searches and ordinary questions are not navigation.
    "go back to BMWs",
    "back to the BMW",
    "does it have heated back seats?",
    "I'll come back later",
    "what's the price on the back row?",
    "take me to the cars",
    "open the second one",
    "",
  ])("%j is not back-navigation", (text) => {
    expect(detectBackNavigationRequest(text)).toBeNull();
  });
});

describe("back to full inventory stays an inventory reset", () => {
  it("clears every filter and never becomes navigate-back", () => {
    const state = normalizeConversationInventoryState({
      turn: 3,
      activeFilters: { make: "Ferrari", priceMin: 100_000 },
      resultSet: null,
    });
    expect(hasFullInventoryResetIntent("back to full inventory")).toBe(true);
    expect(detectBackNavigationRequest("back to full inventory")).toBeNull();
    const transition = transitionInventoryState(state, "back to full inventory", {}, true, {
      nowMs: Date.parse("2026-09-24T10:00:00Z"),
    });
    expect(transition.state.activeFilters).toEqual({});
    expect(transition.shouldQuery).toBe(true);
  });
});

describe("decideBackNavigation", () => {
  it("VDP opened from filtered results, no in-app history: falls back to those results", () => {
    const decision = decideBackNavigation({
      request: { destination: "previous" },
      navigation: NO_HISTORY,
      currentPageIsInventory: false,
      fallback: RESULTS,
    });
    expect(decision).toEqual({
      kind: "action",
      via: "fallback",
      action: { type: "navigate-back", destination: "previous", fallback: RESULTS },
    });
  });

  it("uses in-app history when the browser has a previous LUME page", () => {
    const decision = decideBackNavigation({
      request: { destination: "previous" },
      navigation: { hasPrevious: true, hasResults: false },
      currentPageIsInventory: false,
      fallback: null,
    });
    expect(decision).toMatchObject({ kind: "action", via: "history" });
    expect(decision.kind === "action" && decision.action).toEqual({
      type: "navigate-back",
      destination: "previous",
    });
  });

  it("with no history and no grounded results, refuses instead of pretending", () => {
    expect(
      decideBackNavigation({
        request: { destination: "previous" },
        navigation: NO_HISTORY,
        currentPageIsInventory: false,
        fallback: null,
      }),
    ).toEqual({ kind: "unavailable", destination: "previous" });
  });

  it("'back to the results' while on the results page is already-there", () => {
    expect(
      decideBackNavigation({
        request: { destination: "results" },
        navigation: { hasPrevious: true, hasResults: true },
        currentPageIsInventory: true,
        fallback: RESULTS,
      }),
    ).toEqual({ kind: "already-there", destination: "results" });
  });

  it("never re-opens the results the visitor is already on as a fallback", () => {
    expect(
      decideBackNavigation({
        request: { destination: "previous" },
        navigation: NO_HISTORY,
        currentPageIsInventory: true,
        fallback: RESULTS,
      }),
    ).toEqual({ kind: "unavailable", destination: "previous" });
  });

  it("results destination needs results history, not just any history", () => {
    const decision = decideBackNavigation({
      request: { destination: "results" },
      navigation: { hasPrevious: true, hasResults: false },
      currentPageIsInventory: false,
      fallback: null,
    });
    expect(decision).toEqual({ kind: "unavailable", destination: "results" });
  });
});

describe("backNavigationReply is derived from what was emitted", () => {
  const acting = decideBackNavigation({
    request: { destination: "previous" },
    navigation: { hasPrevious: true, hasResults: false },
    currentPageIsInventory: false,
    fallback: null,
  });

  it("claims the move only when navigate-back was actually emitted", () => {
    const emitted: BotAction[] = [{ type: "navigate-back", destination: "previous" }];
    expect(backNavigationReply(acting, emitted)).toBe("Taking you back to the previous page.");
  });

  it("an action removed by a later gate (plan, persona) is never reported as done", () => {
    const reply = backNavigationReply(acting, []);
    expect(reply).not.toMatch(/taking you back|sent you back|done/i);
    expect(reply).toMatch(/can’t move around the site/);
  });

  it("the fallback route is described as the results", () => {
    const viaFallback = decideBackNavigation({
      request: { destination: "previous" },
      navigation: NO_HISTORY,
      currentPageIsInventory: false,
      fallback: RESULTS,
    });
    expect(
      backNavigationReply(viaFallback, [{ type: "navigate-back", destination: "previous", fallback: RESULTS }]),
    ).toBe("Taking you back to your results.");
  });

  it("unavailable replies make no success claim", () => {
    for (const destination of ["previous", "results"] as const) {
      const reply = backNavigationReply({ kind: "unavailable", destination }, []);
      expect(reply).not.toMatch(/taking you|sent you|done/i);
    }
  });
});

describe("navigate-back through the server gates", () => {
  const action: BotAction = { type: "navigate-back", destination: "previous", fallback: RESULTS };

  it("is discarded when a model or tool emits it — only deterministic rules may", () => {
    const messages = [{ role: "user" as const, content: "go back" }];
    expect(filterModelNavigationActionsByUserIntent([action], messages)).toEqual([]);
  });

  it("survives plan, persona and client preparation unchanged when authored by the server", () => {
    const allowed = filterPlanAllowedActions(true, [action], DEFAULT_BOT_PERSONA_CAPABILITIES);
    expect(prepareBotActionsForClient(allowed, [], {})).toEqual([action]);
  });

  it("is removed on a Basic plan, which the reply then reports truthfully", () => {
    expect(filterPlanAllowedActions(false, [action], DEFAULT_BOT_PERSONA_CAPABILITIES)).toEqual([]);
  });
});

describe("request context parsing", () => {
  it("only a literal true counts; paths or strings are ignored", () => {
    expect(normalizeChatNavigationContext({ hasPrevious: "true", hasResults: 1 })).toEqual(NO_HISTORY);
    expect(normalizeChatNavigationContext({ hasPrevious: true, path: "https://evil.example" })).toEqual({
      hasPrevious: true,
      hasResults: false,
    });
    expect(normalizeChatNavigationContext(undefined)).toEqual(NO_HISTORY);
  });

  it("recognises only the inventory results page as the results page", () => {
    expect(isInventoryResultsPath("/vehicles")).toBe(true);
    expect(isInventoryResultsPath("/vehicles?make=BMW")).toBe(true);
    expect(isInventoryResultsPath("/vehicles/2ae764bd-8de1-4866-86d7-e48fa3cb2b93")).toBe(false);
    expect(isInventoryResultsPath(42)).toBe(false);
  });
});
