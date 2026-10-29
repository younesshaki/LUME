/**
 * Same-origin in-app navigation history (Next port of the Vite
 * `src/lib/inAppHistory.ts`). It exists so the concierge's `navigate-back`
 * action resolves a destination locally and never calls `history.back()`,
 * which could leave the site. Stored in sessionStorage, capped, and scoped to
 * public surfaces only.
 */
import type { InAppHistoryReader } from "./conciergeActions";
import { publicPath } from "./publicPath";

const KEY = "lume.in-app-history.v1";
const MAX_ENTRIES = 50;

function read(): string[] {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(
          (p): p is string => typeof p === "string" && publicPath(p) !== null,
        )
      : [];
  } catch {
    return [];
  }
}

function write(entries: string[]): void {
  try {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify(entries.slice(-MAX_ENTRIES)),
    );
  } catch {
    /* private mode — navigate-back degrades to its grounded fallback */
  }
}

/** Public, same-origin paths only; admin/preview/api never recorded. */
function isSafeInAppPath(path: string): boolean {
  return publicPath(path) !== null;
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

export function inAppHistoryFor(tenant?: string): InAppHistoryReader {
  const scoped = () =>
    read().filter((path) => {
      const selector = new URL(path, "https://in-app.invalid").searchParams.get(
        "tenant",
      );
      return !tenant || !selector || selector === tenant;
    });
  return {
    previous() {
      const entries = scoped();
      // The last entry is the current page; "previous" is the one before it.
      return entries.length >= 2 ? entries[entries.length - 2] : null;
    },
    lastResults() {
      const entries = scoped();
      for (let i = entries.length - 2; i >= 0; i -= 1) {
        if (
          new URL(entries[i], "https://in-app.invalid").pathname === "/vehicles"
        )
          return entries[i];
      }
      return null;
    },
  };
}
export const inAppHistory = inAppHistoryFor();

/** A concierge back operation rewinds the app stack before router.replace. */
export function rewindInAppPath(path: string): void {
  const entries = read();
  const index = entries.lastIndexOf(path);
  if (index >= 0) write(entries.slice(0, index + 1));
}

/** The two booleans the chat request carries (never a path). */
export function inAppHistorySummary(tenant?: string): {
  hasPrevious: boolean;
  hasResults: boolean;
} {
  const history = inAppHistoryFor(tenant);
  return {
    hasPrevious: history.previous() !== null,
    hasResults: history.lastResults() !== null,
  };
}
