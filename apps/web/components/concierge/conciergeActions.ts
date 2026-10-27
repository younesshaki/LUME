/**
 * Translate a validated concierge {@link BotAction} into a Next navigation.
 *
 * Pure and framework-free so it is unit-testable; the island applies the
 * result with `next/navigation`'s router. This is the Next counterpart to the
 * Vite app's `botActionConsumers` + `App.tsx` action handlers, with one
 * deliberate migration: inventory filters target Next's real `?search` params
 * on `/vehicles` (the vocabulary the Phase-2 inventory page already reads),
 * NOT the Vite `#vehicles?` hash scheme.
 *
 * Actions that need target-page state to land (compare, lead-form prefill) are
 * reported as `deferred` here and wired with their consumers in a later slice.
 */
import type { BotAction } from "@lume/blocks/chat-transport";

export type ActionNavigation = {
  kind: "navigate";
  href: string;
  /** Back navigation replaces rather than pushes a new history entry. */
  replace?: boolean;
};
export type ActionDeferred = { kind: "deferred"; reason: string };
export type ActionIgnored = { kind: "ignored" };
export type ActionOutcome = ActionNavigation | ActionDeferred | ActionIgnored;

/** Reads same-origin in-app history so `navigate-back` resolves locally. */
export type InAppHistoryReader = {
  /** Full `pathname(+search)` of the previous same-origin page, if any. */
  previous: () => string | null;
  /** Full path of the most recent inventory-results page, if any. */
  lastResults: () => string | null;
};

/** `filter_inventory` field → Next `?search` param. Values are strings. */
const FILTER_PARAM_MAP: Record<string, string> = {
  make: "make",
  model: "model",
  stockType: "stockType",
  bodyStyle: "bodyStyle",
  fuelType: "fuelType",
  drivetrain: "drivetrain",
  sellerState: "sellerState",
  sellerCity: "sellerCity",
  yearMin: "yearMin",
  yearMax: "yearMax",
  mileageMax: "mileageMax",
  priceMin: "priceMin",
  priceMax: "priceMax",
  sort: "sort",
};

export function resolveActionOutcome(
  action: BotAction,
  history: InAppHistoryReader,
): ActionOutcome {
  switch (action.type) {
    case "navigate": {
      const href = routeStringToHref(action.route);
      return href ? { kind: "navigate", href } : { kind: "ignored" };
    }
    case "filter_inventory":
      return { kind: "navigate", href: inventoryHref(action) };
    case "highlight-vehicle": {
      const id = action.vehicleId.trim();
      return id
        ? { kind: "navigate", href: `/vehicles/${encodeURIComponent(id)}` }
        : { kind: "ignored" };
    }
    case "navigate-target":
      return navigateTargetOutcome(action);
    case "navigate-back":
      return navigateBackOutcome(action, history);
    case "compare_vehicles":
      return { kind: "deferred", reason: "compare consumer not wired yet" };
    case "open-lead-form":
    case "capture_lead":
      return { kind: "deferred", reason: "lead-form prefill not wired yet" };
    default:
      return { kind: "ignored" };
  }
}

/** Maps free-form bot route strings to public Next hrefs. Admin and unknown
 * surfaces are intentionally dropped so chat navigation stays public. */
export function routeStringToHref(route: string): string | null {
  const path = normalizePath(route);
  const vehicleDetail = /^\/vehicles\/([^/]+)$/.exec(path);
  if (vehicleDetail) {
    const id = safeSegment(vehicleDetail[1]);
    return id ? `/vehicles/${encodeURIComponent(id)}` : null;
  }
  const productDetail = /^\/products\/([^/]+)$/.exec(path);
  if (productDetail) {
    const id = safeSegment(productDetail[1]);
    return id ? `/products/${encodeURIComponent(id)}` : null;
  }
  switch (normalizeToken(route)) {
    case "home":
    case "/":
    case "/home":
      return "/";
    case "products":
    case "product":
    case "shop":
    case "/products":
      return "/products";
    case "vehicles":
    case "vehicle":
    case "inventory":
    case "cars":
    case "/vehicles":
      return "/vehicles";
    case "showcase":
    case "experience":
    case "/showcase":
      return "/showcase";
    case "contact":
    case "access":
    case "lead":
    case "lead-form":
    case "/contact":
      return "/contact";
    default:
      return null;
  }
}

function inventoryHref(action: Extract<BotAction, { type: "filter_inventory" }>): string {
  const params = new URLSearchParams();
  const record = action as unknown as Record<string, unknown>;
  for (const [field, param] of Object.entries(FILTER_PARAM_MAP)) {
    const value = record[field];
    if (typeof value === "string" && value.trim())
      params.set(param, value.trim());
    else if (typeof value === "number" && Number.isFinite(value))
      params.set(param, String(value));
  }
  const query = params.toString();
  return query ? `/vehicles?${query}` : "/vehicles";
}

function navigateTargetOutcome(
  action: Extract<BotAction, { type: "navigate-target" }>,
): ActionOutcome {
  if (!action.target) return { kind: "ignored" };
  const { kind, destination } = action.target;
  if (kind === "route") {
    const href = routeStringToHref(destination) ?? asInternalPath(destination);
    return href ? { kind: "navigate", href } : { kind: "ignored" };
  }
  if (kind === "section-anchor") {
    // "/path#anchor" or "#anchor" — keep it same-origin and internal.
    const internal = asInternalPath(destination);
    return internal
      ? { kind: "navigate", href: internal }
      : { kind: "ignored" };
  }
  // form / modal targets need the on-page target runtime (later slice).
  return { kind: "deferred", reason: `target kind "${kind}" not wired yet` };
}

function navigateBackOutcome(
  action: Extract<BotAction, { type: "navigate-back" }>,
  history: InAppHistoryReader,
): ActionOutcome {
  const target =
    action.destination === "results"
      ? history.lastResults()
      : history.previous();
  if (target) return { kind: "navigate", href: target, replace: true };
  // No safe same-origin history: use the grounded filter fallback, else
  // inventory. Never falls back to the browser's own history.back().
  if (action.fallback)
    return { kind: "navigate", href: inventoryHref(action.fallback), replace: true };
  return { kind: "navigate", href: "/vehicles", replace: true };
}

/** Accept only a same-origin, absolute internal path (optionally with a
 * hash), never an external URL or an admin surface. */
function asInternalPath(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.startsWith("#")) return trimmed;
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  if (/^\/(admin|api|account|preview)(\/|$|\?|#)/.test(trimmed)) return null;
  return trimmed;
}

function normalizePath(route: string): string {
  const token = normalizeToken(route);
  return token.startsWith("/") ? token : `/${token}`;
}

function normalizeToken(route: string): string {
  return route.trim().toLowerCase().replace(/\/+$/, "") || "/";
}

function safeSegment(segment: string): string | null {
  try {
    const decoded = decodeURIComponent(segment).trim();
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}
