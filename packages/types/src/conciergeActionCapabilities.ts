/**
 * The public concierge's action capabilities — the single source of truth.
 *
 * An action type may be LIVE only when all of these hold:
 *   1. it is a member of the closed `BotAction` union;
 *   2. the chat server validates and authorizes it (plan, persona, tenant
 *      targets, grounding) before it reaches the browser;
 *   3. the public site has a real consumer for it;
 *   4. it has a safe outcome when browser context is incomplete;
 *   5. unit and browser tests cover it;
 *   6. the model cannot claim it happened unless it was actually emitted;
 *   7. stale-turn suppression applies to it.
 *
 * `satisfies Record<BotAction["type"], …>` makes adding a union member without
 * a registry entry a type error, and apps/admin/lib/conciergeActionCapabilities
 * .test.ts fails when a live type has no browser consumer, when a retired or
 * deferred type is accepted by either validator, or when a server-only type
 * is advertised to the model.
 */
import type { BotAction } from "./bot-actions";

export type PublicConciergeActionType = BotAction["type"];

export type PublicConciergeActionCapability = {
  /**
   * Who may originate the action.
   *  - `server`: deterministic server rules only. Model or tool output of
   *    this type is always discarded, and /api/bot-actions refuses it.
   *  - `server-or-model`: model output is accepted after server validation.
   */
  origin: "server" | "server-or-model";
  /** Where the browser consumes it. */
  consumer: "app-router" | "lead-capture-bridge";
  /** What the browser does when the context it needs is missing. */
  safeFallback: string;
};

export const PUBLIC_CONCIERGE_ACTIONS = {
  filter_inventory: {
    origin: "server-or-model",
    consumer: "app-router",
    safeFallback: "Unrecognised facets are dropped; the inventory opens unfiltered.",
  },
  navigate: {
    origin: "server-or-model",
    consumer: "app-router",
    safeFallback: "Only the public route allowlist resolves; anything else is ignored.",
  },
  "navigate-target": {
    origin: "server-or-model",
    consumer: "app-router",
    safeFallback: "Only an enabled tenant target with a server-attached descriptor resolves.",
  },
  "highlight-vehicle": {
    origin: "server-or-model",
    consumer: "app-router",
    safeFallback: "Dropped server-side unless the vehicle is grounded this turn.",
  },
  compare_vehicles: {
    origin: "server-or-model",
    consumer: "app-router",
    safeFallback: "Fewer than two grounded vehicles opens no comparison.",
  },
  "open-lead-form": {
    origin: "server-or-model",
    consumer: "app-router",
    safeFallback: "Opens the contact form with only the allowlisted prefill fields.",
  },
  capture_lead: {
    origin: "server-or-model",
    consumer: "lead-capture-bridge",
    safeFallback: "Dropped unless the email or phone appears in a visitor message.",
  },
  "navigate-back": {
    origin: "server",
    consumer: "app-router",
    safeFallback:
      "Same-origin in-app history, then the server-grounded results, else nothing — never browser history, never off-site.",
  },
} as const satisfies Record<PublicConciergeActionType, PublicConciergeActionCapability>;

export const PUBLIC_CONCIERGE_ACTION_TYPES = Object.keys(
  PUBLIC_CONCIERGE_ACTIONS,
) as PublicConciergeActionType[];

/**
 * Declared once, now retired. Legacy model output of these types is
 * recognised only so it can be stripped from visible text; it is never
 * executed, advertised, or accepted by either validator.
 */
export const PUBLIC_CONCIERGE_RETIRED_ACTIONS = {
  "scroll-to": {
    reason:
      "A free-form sectionId cannot be validated against anything a tenant registered, and no browser consumer existed. Use navigate-target with a tenant-registered section-anchor target.",
  },
} as const;

/**
 * Typed but deliberately NOT in `BotAction`. Promoting one requires a public
 * flow that collects its fields with explicit visitor confirmation and
 * creates a tenant-scoped, attributed lead — see the action registry doc.
 */
export const PUBLIC_CONCIERGE_DEFERRED_ACTIONS = {
  schedule_appointment: {
    reason:
      "No public flow collects a date/time with explicit visitor confirmation. Booking intent opens the vehicle-inquiry target instead.",
  },
  schedule_test_drive: {
    reason:
      "The TestDriveBooking page block creates test-drive leads, but only through its own form. Tenants can expose it as a navigate-target; a chat-native booking action is deferred.",
  },
} as const;

export type RetiredPublicConciergeActionType =
  keyof typeof PUBLIC_CONCIERGE_RETIRED_ACTIONS;

export function isPublicConciergeActionType(
  value: unknown,
): value is PublicConciergeActionType {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(PUBLIC_CONCIERGE_ACTIONS, value)
  );
}

export function isRetiredPublicConciergeActionType(
  value: unknown,
): value is RetiredPublicConciergeActionType {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(PUBLIC_CONCIERGE_RETIRED_ACTIONS, value)
  );
}

/** True for types only deterministic server rules may originate. */
export function isServerAuthoredOnlyAction(type: PublicConciergeActionType): boolean {
  return PUBLIC_CONCIERGE_ACTIONS[type].origin === "server";
}
