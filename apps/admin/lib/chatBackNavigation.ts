/**
 * Deterministic in-site "go back" for the public concierge.
 *
 * Confirmed production failure (2026-09): a visitor opened a vehicle from a
 * filtered result set, said "go back", and was told "Done — I've sent you
 * back" while the server emitted no action. Back-navigation is now a
 * server-authored capability: this module decides whether it can be honoured
 * and words the reply from what was actually emitted, never the other way
 * round.
 *
 * Safety model (see docs/concierge-target-registry.md, "navigate-back"):
 *  - The action carries no URL. The browser resolves the destination from its
 *    own same-origin record of pages visited in this tab (src/lib/inAppHistory).
 *  - The browser reports only two booleans (`hasPrevious`, `hasResults`). They
 *    choose wording; they can never choose a destination.
 *  - The fallback is the conversation's verified result set, built by the
 *    server — never model text.
 *
 * "Back to full inventory", "show all inventory" and "clear my filters" are
 * NOT back-navigation: they are inventory resets and keep their existing
 * filter_inventory behaviour. Detection refuses any text a reset rule claims.
 */
import type {
  BotAction,
  BotInventoryFilterAction,
  BotNavigateBackAction,
  ChatNavigationContext,
} from "@lume/types";
import {
  hasFullInventoryResetIntent,
  hasScopeResetIntent,
} from "./chatConversationState";

export type BackNavigationRequest = {
  destination: BotNavigateBackAction["destination"];
};

export type BackNavigationDecision =
  | {
      kind: "action";
      action: BotNavigateBackAction;
      /** Which source the browser is expected to use. */
      via: "history" | "fallback";
    }
  /** The visitor asked for the results and is already looking at them. */
  | { kind: "already-there"; destination: BotNavigateBackAction["destination"] }
  /** Neither in-app history nor a grounded result set exists. */
  | { kind: "unavailable"; destination: BotNavigateBackAction["destination"] };

const POLITE_PREFIX = String.raw`(?:(?:please|ok|okay|now|and|can you|could you|would you|just)\s+)*`;
const POLITE_SUFFIX = String.raw`(?:\s+(?:please|now|thanks|thank you))*`;
const BACK_VERB = String.raw`(?:go|take me|bring me|send me|get me|head|navigate|jump|step)\s+back`;
const RESULTS_NOUN = String.raw`(?:the\s+|my\s+|those\s+|these\s+|our\s+)?(?:results?|search results|search|list|listings?|cars|vehicles|car list|vehicle list)`;
const PREVIOUS_PLACE = String.raw`(?:the\s+)?(?:previous|last|prior)\s+(?:page|screen|one)|where i was`;

const BACK_TO_RESULTS_PATTERN = new RegExp(
  `^${POLITE_PREFIX}(?:${BACK_VERB}\\s+to|return\\s+to|back\\s+to)\\s+${RESULTS_NOUN}${POLITE_SUFFIX}$`,
);

const BACK_TO_PREVIOUS_PATTERN = new RegExp(
  [
    // "go back", "take me back", "back", "go back one page"
    `^${POLITE_PREFIX}(?:${BACK_VERB}|back)(?:\\s+(?:a|one)\\s+page)?${POLITE_SUFFIX}$`,
    // "go back to the previous page", "back to where i was", "return to the last page"
    `^${POLITE_PREFIX}(?:${BACK_VERB}\\s+to|return\\s+to|back\\s+to|go\\s+to|take\\s+me\\s+to)\\s+(?:${PREVIOUS_PLACE})${POLITE_SUFFIX}$`,
    // "previous page", "last page"
    `^${POLITE_PREFIX}(?:${PREVIOUS_PLACE})${POLITE_SUFFIX}$`,
  ].join("|"),
);

/**
 * Recognise a request to move back within the site. Anchored to the whole
 * message, so "go back to BMWs" (a new search) or "the back seats" never
 * match, and anything an inventory-reset rule claims is refused first.
 */
export function detectBackNavigationRequest(
  userText: string,
): BackNavigationRequest | null {
  if (hasFullInventoryResetIntent(userText) || hasScopeResetIntent(userText)) {
    return null;
  }
  const normalized = normalize(userText);
  if (!normalized) return null;
  if (BACK_TO_RESULTS_PATTERN.test(normalized)) return { destination: "results" };
  if (BACK_TO_PREVIOUS_PATTERN.test(normalized)) return { destination: "previous" };
  return null;
}

/** Read the browser's history summary strictly: only `true` counts. */
export function normalizeChatNavigationContext(
  value: unknown,
): Required<ChatNavigationContext> {
  const record =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    hasPrevious: record.hasPrevious === true,
    hasResults: record.hasResults === true,
  };
}

/** True when the visitor is on the inventory results page itself. */
export function isInventoryResultsPath(pagePath: unknown): boolean {
  if (typeof pagePath !== "string" || pagePath.length > 300) return false;
  const path = pagePath.trim().split(/[?#]/, 1)[0]?.replace(/\/+$/, "") ?? "";
  return path === "/vehicles";
}

export function decideBackNavigation(input: {
  request: BackNavigationRequest;
  navigation: Required<ChatNavigationContext>;
  currentPageIsInventory: boolean;
  /** Server-grounded results, or null when none may be used. */
  fallback: BotInventoryFilterAction | null;
}): BackNavigationDecision {
  const { destination } = input.request;
  if (destination === "results" && input.currentPageIsInventory) {
    return { kind: "already-there", destination };
  }
  // Re-opening the results the visitor is already on is not "going back".
  const fallback = input.currentPageIsInventory ? null : input.fallback;
  const historyAvailable =
    destination === "results"
      ? input.navigation.hasResults
      : input.navigation.hasPrevious;
  if (historyAvailable || fallback) {
    return {
      kind: "action",
      action: {
        type: "navigate-back",
        destination,
        ...(fallback ? { fallback } : {}),
      },
      via: historyAvailable ? "history" : "fallback",
    };
  }
  return { kind: "unavailable", destination };
}

/**
 * The reply, derived from what was actually emitted after every server gate
 * (plan, persona, stale-turn commit). A decision to act whose action did not
 * survive is reported as unavailable, never as done.
 */
export function backNavigationReply(
  decision: BackNavigationDecision,
  emitted: readonly BotAction[],
): string {
  if (decision.kind === "already-there") {
    return "You’re already on the results page.";
  }
  if (decision.kind === "action") {
    const sent = emitted.some((action) => action.type === "navigate-back");
    if (!sent) {
      return "I can’t move around the site for you here, but your browser’s back button will take you to the previous page.";
    }
    return decision.action.destination === "previous" && decision.via === "history"
      ? "Taking you back to the previous page."
      : "Taking you back to your results.";
  }
  return decision.destination === "results"
    ? "I don’t have any earlier results to take you back to yet. Tell me what you’re looking for and I’ll search the inventory."
    : "There isn’t an earlier page on this site to take you back to. I can open the inventory or the home page if you’d like.";
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
