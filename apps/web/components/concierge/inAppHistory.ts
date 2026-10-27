/**
 * Same-origin in-app navigation history (Next port of the Vite
 * `src/lib/inAppHistory.ts`). It exists so the concierge's `navigate-back`
 * action resolves a destination locally and never calls `history.back()`,
 * which could leave the site. Stored in sessionStorage, capped, and scoped to
 * public surfaces only.
 */
import type { InAppHistoryReader } from "./conciergeActions";

const KEY = "lume.in-app-history.v1";
const MAX_ENTRIES = 50;

function read(): string[] {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((p): p is string => typeof p === "string")
      : [];
  } catch {
    return [];
  }
}

function write(entries: string[]): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    /* private mode — navigate-back degrades to its grounded fallback */
  }
}

/** Public, same-origin paths only; admin/preview/api never recorded. */
function isSafeInAppPath(path: string): boolean {
  return (
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !/^\/(admin|api|account|preview)(\/|$|\?|#)/.test(path)
  );
}

/** Record the page just rendered. No-op for duplicate consecutive entries
 * (a refresh) and unsafe paths. */
export function recordInAppPath(path: string): void {
  if (typeof window === "undefined" || !isSafeInAppPath(path)) return;
  const entries = read();
  if (entries[entries.length - 1] === path) return;
  entries.push(path);
  write(entries);
}

export const inAppHistory: InAppHistoryReader = {
  previous() {
    const entries = read();
    // The last entry is the current page; "previous" is the one before it.
    return entries.length >= 2 ? entries[entries.length - 2] : null;
  },
  lastResults() {
    const entries = read();
    for (let i = entries.length - 2; i >= 0; i -= 1) {
      if (entries[i].startsWith("/vehicles") && !/^\/vehicles\/[^/?#]/.test(entries[i]))
        return entries[i];
    }
    return null;
  },
};

/** The two booleans the chat request carries (never a path). */
export function inAppHistorySummary(): { hasPrevious: boolean; hasResults: boolean } {
  return {
    hasPrevious: inAppHistory.previous() !== null,
    hasResults: inAppHistory.lastResults() !== null,
  };
}
