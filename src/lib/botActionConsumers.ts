import type {
  BotInventoryFilterAction,
  BotOpenLeadFormAction,
} from "@lume/types";
import {
  DEFAULT_FILTERS,
  type VehicleFilters,
} from "@/experience/vehicles/catalog";
import type { AppRouteLocation } from "@/app-shell/routePaths";

export type LeadFormPrefill = Partial<{
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;
}>;

const PENDING_INVENTORY_FILTER_KEY = "lume.bot.pending-inventory-filter.v1";
const PENDING_LEAD_FORM_PREFILL_KEY = "lume.bot.pending-lead-form-prefill.v1";
const LEAD_FORM_FIELDS = ["firstName", "lastName", "email", "phone", "message"] as const;

let pendingInventoryFilterFallback: VehicleFilters | null = null;
let pendingLeadFormPrefillFallback: LeadFormPrefill | null = null;

/**
 * Maps free-form bot route strings to public app routes. Admin routes are
 * intentionally excluded because chat navigation should stay on public surfaces.
 */
export function resolveBotNavigationRoute(route: string): AppRouteLocation | null {
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

/** Stores a bot inventory filter so the vehicles route can consume it after navigation. */
export function storePendingInventoryFilter(action: BotInventoryFilterAction): void {
  const filters = vehicleFiltersFromBotAction(action);
  pendingInventoryFilterFallback = filters;
  writeSessionJson(PENDING_INVENTORY_FILTER_KEY, filters);
}

/** Reads and clears one pending bot inventory filter. */
export function consumePendingInventoryFilter(): VehicleFilters | null {
  const stored = readSessionJson<VehicleFilters>(PENDING_INVENTORY_FILTER_KEY);
  removeSessionItem(PENDING_INVENTORY_FILTER_KEY);
  const fallback = pendingInventoryFilterFallback;
  pendingInventoryFilterFallback = null;
  return stored ?? fallback;
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
  pendingLeadFormPrefillFallback = prefill;
  writeSessionJson(PENDING_LEAD_FORM_PREFILL_KEY, prefill);
}

/** Reads and clears one pending bot lead-form prefill. */
export function consumePendingLeadFormPrefill(): LeadFormPrefill | null {
  const stored = readSessionJson<LeadFormPrefill>(PENDING_LEAD_FORM_PREFILL_KEY);
  removeSessionItem(PENDING_LEAD_FORM_PREFILL_KEY);
  const fallback = pendingLeadFormPrefillFallback;
  pendingLeadFormPrefillFallback = null;
  return stored ?? fallback;
}

function normalizeRouteInput(route: string): string {
  const trimmed = route.trim().toLowerCase();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    return url.pathname.replace(/\/+$/, "") || "/";
  } catch {
    const [withoutQuery] = trimmed.split(/[?#]/, 1);
    return withoutQuery.replace(/\/+$/, "") || "/";
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
