/**
 * Same-origin record of the public pages visited in this LUME tab.
 *
 * It exists so the concierge's `navigate-back` can never send a visitor off
 * the site. `window.history.back()` would: the previous entry may be Google,
 * another dealer, or an email link, and `history.length` cannot tell. This
 * record only ever contains paths the in-app router rendered, so every
 * destination it yields is a LUME page by construction.
 *
 * Entries are keyed by react-router's per-entry `location.key`, which lets a
 * browser back/forward (POP) be matched to the entry it returned to instead
 * of being mistaken for a new page.
 *
 * Navigation to a recorded entry is a normal in-app push to that path — never
 * `history.back()` / `navigate(-1)` — and is followed by `markPendingBack` so
 * the record treats it as a return (the stack shrinks) rather than a new page.
 */
import type { BotNavigateBackAction } from "@lume/types";

export type NavigationType = "PUSH" | "POP" | "REPLACE";

export type InAppHistoryEntry = { key: string; path: string };

export type BackNavigationTarget =
  | { kind: "history"; path: string; index: number }
  | { kind: "fallback"; fallback: NonNullable<BotNavigateBackAction["fallback"]> };

const STORAGE_KEY = "lume.in-app-history.v1";
const MAX_ENTRIES = 50;
const MAX_PATH_LENGTH = 2_000;

/**
 * A path the concierge may return a visitor to: same-origin by shape, and a
 * public page. Admin and editor-preview surfaces are never destinations.
 */
export function isSafeInAppPath(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0 || path.length > MAX_PATH_LENGTH) {
    return false;
  }
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return false;
  if (/[\u0000-\u001f\u007f]/.test(path)) return false;
  const pathname = path.split(/[?#]/, 1)[0] ?? "";
  if (/^\/(?:admin|__)(?:\/|$)/.test(pathname)) return false;
  if (pathname === "/page-preview" || pathname.startsWith("/preview")) return false;
  return true;
}

/** The inventory results page (not a vehicle detail page). */
export function isInventoryResultsPath(path: string): boolean {
  const pathname = (path.split(/[?#]/, 1)[0] ?? "").replace(/\/+$/, "");
  return pathname === "/vehicles";
}

export class InAppHistory {
  private entries: InAppHistoryEntry[];
  private pendingBack: { index: number; path: string } | null = null;

  constructor(
    initial: readonly InAppHistoryEntry[] = [],
    private readonly persist: (entries: readonly InAppHistoryEntry[]) => void = () => undefined,
  ) {
    this.entries = initial
      .filter((entry) => typeof entry?.key === "string" && isSafeInAppPath(entry.path))
      .slice(-MAX_ENTRIES);
  }

  /** Record one router location change. Unsafe paths are never recorded. */
  record(location: { key: string; path: string }, navigationType: NavigationType): void {
    if (!isSafeInAppPath(location.path)) return;
    const entry = { key: location.key, path: location.path };
    const top = this.entries[this.entries.length - 1];
    if (top?.key === entry.key) {
      top.path = entry.path;
      return this.save();
    }

    const pending = this.pendingBack;
    this.pendingBack = null;
    if (pending && pending.path === entry.path && navigationType !== "POP") {
      // The concierge's own return: collapse to the entry it returned to.
      this.entries = [...this.entries.slice(0, pending.index), entry];
      return this.save();
    }

    if (navigationType === "POP") {
      const index = this.entries.findIndex((candidate) => candidate.key === entry.key);
      if (index >= 0) {
        this.entries = this.entries.slice(0, index + 1);
        return this.save();
      }
      // A reload re-renders the same page under a fresh key: it is the same
      // entry, not a new page on top of itself.
      if (top && top.path === entry.path) {
        top.key = entry.key;
        return this.save();
      }
    }
    if (navigationType === "REPLACE" && top) {
      this.entries = [...this.entries.slice(0, -1), entry];
      return this.save();
    }
    this.entries = [...this.entries, entry].slice(-MAX_ENTRIES);
    this.save();
  }

  /** The most recent page before the current one, if any. */
  previous(): { path: string; index: number } | null {
    const current = this.entries[this.entries.length - 1];
    for (let index = this.entries.length - 2; index >= 0; index -= 1) {
      const entry = this.entries[index];
      // "Back" to the page already on screen would be a no-op dressed up as
      // an action.
      if (entry && entry.path !== current?.path) return { path: entry.path, index };
    }
    return null;
  }

  /** The most recent inventory results page before the current one, if any. */
  latestResults(): { path: string; index: number } | null {
    for (let index = this.entries.length - 2; index >= 0; index -= 1) {
      const entry = this.entries[index];
      if (entry && isInventoryResultsPath(entry.path)) return { path: entry.path, index };
    }
    return null;
  }

  /** The two booleans the chat request carries. Never a path. */
  summary(): { hasPrevious: boolean; hasResults: boolean } {
    return {
      hasPrevious: this.previous() !== null,
      hasResults: this.latestResults() !== null,
    };
  }

  /** Call just before navigating to a history target's path. */
  markPendingBack(target: { index: number; path: string }): void {
    this.pendingBack = { index: target.index, path: target.path };
  }

  snapshot(): readonly InAppHistoryEntry[] {
    return this.entries.map((entry) => ({ ...entry }));
  }

  private save(): void {
    this.persist(this.entries);
  }
}

/**
 * Where a `navigate-back` should take the visitor: the in-app history first,
 * then the server's grounded results, else nowhere. Pure, so the decision is
 * testable without a router.
 */
export function resolveBackNavigationTarget(
  history: Pick<InAppHistory, "previous" | "latestResults">,
  action: BotNavigateBackAction,
): BackNavigationTarget | null {
  const entry =
    action.destination === "results" ? history.latestResults() : history.previous();
  if (entry && isSafeInAppPath(entry.path)) {
    return { kind: "history", path: entry.path, index: entry.index };
  }
  if (action.fallback?.type === "filter_inventory") {
    return { kind: "fallback", fallback: action.fallback };
  }
  return null;
}

/**
 * A fresh arrival from another site starts with no history, even though
 * sessionStorage survives a same-tab round trip through another origin.
 * Reloads and back/forward keep it.
 */
function arrivedFromAnotherSite(): boolean {
  try {
    const navigation = window.performance?.getEntriesByType?.("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (navigation && navigation.type !== "navigate") return false;
    if (!document.referrer) return true;
    return new URL(document.referrer).origin !== window.location.origin;
  } catch {
    return true;
  }
}

function loadEntries(): InAppHistoryEntry[] {
  if (typeof window === "undefined") return [];
  if (arrivedFromAnotherSite()) return [];
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(
          (entry): entry is InAppHistoryEntry =>
            typeof entry === "object" &&
            entry !== null &&
            typeof (entry as InAppHistoryEntry).key === "string" &&
            isSafeInAppPath((entry as InAppHistoryEntry).path),
        )
      : [];
  } catch {
    return [];
  }
}

function saveEntries(entries: readonly InAppHistoryEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // In-memory history still works for this page lifetime.
  }
}

/**
 * The tab's history. Session-scoped so a reload keeps it; a new tab (or an
 * arrival from another site) starts empty, which is exactly the case where
 * the concierge must not claim a way back.
 */
export const inAppHistory = new InAppHistory(loadEntries(), saveEntries);
