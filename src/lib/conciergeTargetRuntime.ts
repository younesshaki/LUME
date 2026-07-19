import {
  validateConciergeTargetDestination,
  type BotNavigateTargetAction,
  type ConciergeTargetKind,
} from "@lume/types";
import type { AppRouteLocation } from "@/app-shell/routePaths";
import { resolveBotNavigationRoute } from "./botActionConsumers";

const PENDING_TARGET_KEY = "lume.concierge.pending-target.v1";
const TARGET_PARAM_PATTERN = /:([A-Za-z][A-Za-z0-9]{0,39})/g;

export type ResolvedConciergeTarget = {
  action: BotNavigateTargetAction;
  path: string;
  route: AppRouteLocation | null;
  handlerId: string | null;
  kind: ConciergeTargetKind;
};

type TargetHandler = (action: BotNavigateTargetAction) => void;

let pendingFallback: BotNavigateTargetAction | null = null;
const targetHandlers = new Map<string, Set<TargetHandler>>();

export function resolveConciergeTargetAction(
  action: BotNavigateTargetAction,
): ResolvedConciergeTarget | null {
  const target = action.target;
  if (!target || target.key !== action.targetKey) return null;
  if (validateConciergeTargetDestination(target.kind, target.destination)) return null;

  let missingParameter = false;
  let unsafeParameter = false;
  const destination = target.destination.replace(
    TARGET_PARAM_PATTERN,
    (_placeholder, key: string) => {
      const value = action.params?.[key]?.trim();
      if (!value) {
        missingParameter = true;
        return "";
      }
      if (value === "." || value === "..") {
        unsafeParameter = true;
        return "";
      }
      return encodeURIComponent(value);
    },
  );
  if (missingParameter || unsafeParameter) return null;

  const [path, handlerId] = destination.split("#");
  if (!path) return null;
  try {
    const canonicalPath = new URL(path, "https://lume.invalid").pathname;
    if (canonicalPath !== path) return null;
  } catch {
    return null;
  }
  return {
    action,
    path,
    route: resolveBotNavigationRoute(path),
    handlerId: handlerId || null,
    kind: target.kind,
  };
}

export function queueConciergeTargetAction(action: BotNavigateTargetAction): void {
  pendingFallback = action;
  writeSessionJson(PENDING_TARGET_KEY, action);
}

export function clearPendingConciergeTargetAction(): void {
  pendingFallback = null;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PENDING_TARGET_KEY);
  } catch {
    // In-memory fallback already cleared.
  }
}

export function peekPendingConciergeTargetAction(): BotNavigateTargetAction | null {
  const stored = readSessionJson(PENDING_TARGET_KEY);
  return isTrustedTargetAction(stored) ? stored : pendingFallback;
}

/**
 * Activate the pending handler/anchor only when its resolved route is mounted.
 * Returns true after execution; otherwise the pending action remains for the
 * registering destination component.
 */
export function activatePendingConciergeTarget(
  pathname: string,
): boolean {
  const action = peekPendingConciergeTargetAction();
  if (!action) return false;
  const resolved = resolveConciergeTargetAction(action);
  if (!resolved || normalizePath(pathname) !== normalizePath(resolved.path)) return false;
  if (!resolved.handlerId) {
    clearPendingConciergeTargetAction();
    return true;
  }
  if (!activateHandler(resolved.handlerId, resolved.kind, action)) return false;
  clearPendingConciergeTargetAction();
  return true;
}

/**
 * Keep one route-scoped observer while a lazy destination is mounting. This
 * makes a plain safe DOM id sufficient for section/form targets; registered
 * handlers still activate immediately through registerConciergeTargetHandler.
 */
export function watchPendingConciergeTarget(pathname: string): () => void {
  if (activatePendingConciergeTarget(pathname)) return () => undefined;
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") {
    return () => undefined;
  }
  const pending = peekPendingConciergeTargetAction();
  const resolved = pending ? resolveConciergeTargetAction(pending) : null;
  if (
    !resolved?.handlerId ||
    normalizePath(pathname) !== normalizePath(resolved.path)
  ) {
    return () => undefined;
  }

  const observer = new MutationObserver(() => {
    if (activatePendingConciergeTarget(pathname)) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}

export function registerConciergeTargetHandler(
  handlerId: string,
  handler: TargetHandler,
): () => void {
  let handlers = targetHandlers.get(handlerId);
  if (!handlers) {
    handlers = new Set();
    targetHandlers.set(handlerId, handlers);
  }
  handlers.add(handler);

  const pending = peekPendingConciergeTargetAction();
  const resolved = pending ? resolveConciergeTargetAction(pending) : null;
  const currentPath =
    typeof window !== "undefined" ? normalizePath(window.location.pathname) : "";
  if (
    pending &&
    resolved?.handlerId === handlerId &&
    normalizePath(resolved.path) === currentPath
  ) {
    try {
      handler(pending);
      clearPendingConciergeTargetAction();
    } catch {
      // Leave the action pending so a remount or another registered handler
      // can recover instead of losing the visitor's requested destination.
    }
  }

  return () => {
    handlers?.delete(handler);
    if (handlers?.size === 0) targetHandlers.delete(handlerId);
  };
}

function activateHandler(
  handlerId: string,
  kind: ConciergeTargetKind,
  action: BotNavigateTargetAction,
): boolean {
  const handlers = targetHandlers.get(handlerId);
  if (handlers?.size) {
    let handled = false;
    for (const handler of handlers) {
      try {
        handler(action);
        handled = true;
      } catch {
        // Isolate target handlers exactly like the BotAction bus.
      }
    }
    return handled;
  }

  if (typeof document === "undefined") return false;
  const element = document.getElementById(handlerId);
  if (!element) return false;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({
    behavior: reducedMotion ? "auto" : "smooth",
    block: "center",
  });
  if (kind === "form") {
    element
      .querySelector<HTMLElement>(
        "input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)",
      )
      ?.focus({ preventScroll: true });
  } else if (kind === "modal" && element instanceof HTMLElement) {
    element.click();
  }
  return true;
}

function normalizePath(path: string): string {
  return path.replace(/\/+$/, "") || "/";
}

function isTrustedTargetAction(value: unknown): value is BotNavigateTargetAction {
  if (!isRecord(value) || value.type !== "navigate-target") return false;
  if (
    typeof value.targetKey !== "string" ||
    !isRecord(value.target) ||
    value.target.key !== value.targetKey ||
    typeof value.target.label !== "string" ||
    typeof value.target.destination !== "string" ||
    typeof value.target.isConversion !== "boolean" ||
    !["route", "section-anchor", "form", "modal"].includes(
      String(value.target.kind),
    )
  ) {
    return false;
  }
  return (
    value.params === undefined ||
    (isRecord(value.params) &&
      Object.values(value.params).every((item) => typeof item === "string"))
  );
}

function writeSessionJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The in-memory fallback keeps same-session actions working.
  }
}

function readSessionJson(key: string): unknown {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(key);
    return value ? (JSON.parse(value) as unknown) : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
