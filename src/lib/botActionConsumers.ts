import type {
  BotInventoryFilterAction,
  BotOpenLeadFormAction,
  LeadSourceContext,
} from "@lume/types";
import {
  DEFAULT_FILTERS,
  type VehicleFilters,
} from "@/experience/vehicles/catalog";
import { encodeVehicleUrlState } from "@/experience/vehicles/urlState";
import type { AppRouteLocation } from "@/app-shell/routePaths";

export type LeadFormPrefill = Partial<{
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;
}>;

const PENDING_LEAD_FORM_PREFILL_KEY = "lume.bot.pending-lead-form-prefill.v1";
const PENDING_LEAD_FORM_CONTEXT_KEY = "lume.bot.pending-lead-form-context.v1";
const LEAD_FORM_FIELDS = ["firstName", "lastName", "email", "phone", "message"] as const;

let pendingLeadFormPrefillFallback: LeadFormPrefill | null = null;
let pendingLeadFormContextFallback: LeadSourceContext | null = null;

/**
 * Maps free-form bot route strings to public app routes. Admin routes are
 * intentionally excluded because chat navigation should stay on public surfaces.
 */
export function resolveBotNavigationRoute(route: string): AppRouteLocation | null {
  const path = normalizeRoutePath(route);
  const vehicleDetail = /^\/vehicles\/([^/]+)$/.exec(path);
  if (vehicleDetail) {
    const vehicleId = safeDecodePathSegment(vehicleDetail[1]);
    return vehicleId ? { route: "vehicleDetail", vehicleId } : null;
  }
  const productDetail = /^\/products\/([^/]+)$/.exec(path);
  if (productDetail) {
    const productId = safeDecodePathSegment(productDetail[1]);
    return productId ? { route: "productDetail", productId } : null;
  }

  const normalized = normalizeRouteInput(route);
  switch (normalized) {
    case "home":
    case "/":
    case "/home":
      return { route: "home" };
    case "products":
    case "product":
    case "shop":
    case "/products":
      return { route: "products" };
    case "vehicles":
    case "vehicle":
    case "inventory":
    case "cars":
    case "/vehicles":
      return { route: "vehicles" };
    case "showcase":
    case "experience":
    case "/showcase":
    case "/showcase/intro":
    case "/showcase/experience":
      return { route: "showcase" };
    case "contact":
    case "access":
    case "lead":
    case "lead-form":
    case "/contact":
      return { route: "contact" };
    default:
      return null;
  }
}

/** Converts a coarse bot inventory action into the full public vehicle filter state. */
export function vehicleFiltersFromBotAction(
  action: BotInventoryFilterAction
): VehicleFilters {
  return {
    ...DEFAULT_FILTERS,
    make: textValue(action.make),
    bodyStyle: textValue(action.bodyStyle),
    priceMin: nonNegativeNumber(action.priceMin),
    priceMax: nonNegativeNumber(action.priceMax),
  };
}

/**
 * Carries bot filters in the existing inventory URL state. Unlike a one-shot
 * session value, this survives lazy fallback → published block renderer swaps.
 */
export function vehicleRouteFromBotAction(
  action: BotInventoryFilterAction,
): Extract<AppRouteLocation, { route: "vehicles" }> {
  return {
    route: "vehicles",
    inventoryState: encodeVehicleUrlState(
      vehicleFiltersFromBotAction(action),
      "recommended",
      1,
    ),
  };
}

/** Extracts string fields from the bot lead-form payload and drops unsupported keys. */
export function leadFormPrefillFromAction(
  action: BotOpenLeadFormAction
): LeadFormPrefill | null {
  const prefill = action.prefill;
  if (!prefill) return null;

  const next: LeadFormPrefill = {};
  for (const field of LEAD_FORM_FIELDS) {
    const value = prefill[field];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) next[field] = trimmed;
  }

  return Object.keys(next).length > 0 ? next : null;
}

/** Applies bot prefill without clearing any form fields the bot did not provide. */
export function mergeLeadFormPrefill<T extends LeadFormPrefill>(
  current: T,
  prefill: LeadFormPrefill | null
): T {
  if (!prefill) return current;
  return { ...current, ...prefill };
}

/** Stores lead-form prefill so the contact route can focus and populate after navigation. */
export function storePendingLeadFormPrefill(action: BotOpenLeadFormAction): void {
  const prefill = leadFormPrefillFromAction(action) ?? {};
  const context = botLeadFormSourceContext(action);
  pendingLeadFormPrefillFallback = prefill;
  pendingLeadFormContextFallback = context;
  writeSessionJson(PENDING_LEAD_FORM_PREFILL_KEY, prefill);
  writeSessionJson(PENDING_LEAD_FORM_CONTEXT_KEY, context);
}

/** Reads and clears one pending bot lead-form prefill. */
export function consumePendingLeadFormPrefill(): LeadFormPrefill | null {
  const stored = readSessionJson<LeadFormPrefill>(PENDING_LEAD_FORM_PREFILL_KEY);
  removeSessionItem(PENDING_LEAD_FORM_PREFILL_KEY);
  const fallback = pendingLeadFormPrefillFallback;
  pendingLeadFormPrefillFallback = null;
  return stored ?? fallback;
}

/** Reads and clears bot attribution captured before contact-page navigation. */
export function consumePendingLeadFormSourceContext(): LeadSourceContext | null {
  const stored = readSessionJson<LeadSourceContext>(PENDING_LEAD_FORM_CONTEXT_KEY);
  removeSessionItem(PENDING_LEAD_FORM_CONTEXT_KEY);
  const fallback = pendingLeadFormContextFallback;
  pendingLeadFormContextFallback = null;
  return isLeadFormSourceContext(stored) ? stored : fallback;
}

export function botLeadFormSourceContext(
  action?: Pick<BotOpenLeadFormAction, "vehicleId" | "attribution">,
): LeadSourceContext {
  return {
    trigger: "bot-action",
    actionType: "open-lead-form",
    ...(action?.vehicleId ? { vehicleId: action.vehicleId } : {}),
    ...(action?.attribution?.targetKey
      ? { targetKey: action.attribution.targetKey }
      : {}),
    ...(action?.attribution?.sessionId
      ? { chatSessionId: action.attribution.sessionId }
      : {}),
    ...(action?.attribution?.conversationContext
      ? { conversationContext: action.attribution.conversationContext }
      : {}),
  };
}

function normalizeRouteInput(route: string): string {
  return normalizeRoutePath(route).toLowerCase();
}

function normalizeRoutePath(route: string): string {
  const trimmed = route.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    return url.pathname.replace(/\/+$/, "") || "/";
  } catch {
    const [withoutQuery] = trimmed.split(/[?#]/, 1);
    return withoutQuery.replace(/\/+$/, "") || "/";
  }
}

function safeDecodePathSegment(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function textValue(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function nonNegativeNumber(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function writeSessionJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The in-memory fallback keeps same-session bot actions working.
  }
}

function readSessionJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function removeSessionItem(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore unavailable storage.
  }
}

function isLeadFormSourceContext(value: unknown): value is LeadSourceContext {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { trigger?: unknown }).trigger === "bot-action" &&
    (value as { actionType?: unknown }).actionType === "open-lead-form"
  );
}
