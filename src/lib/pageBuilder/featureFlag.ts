/**
 * Gate for database-driven page rendering.
 *
 * Two ways it turns on:
 *  1. Build-time: `VITE_PAGE_RENDERER === "true"` enables it for everyone
 *     (used when a tenant is fully migrated to the page builder).
 *  2. Per-viewer preview: visiting any URL with `?preview=<token>` switches
 *     it on for *that visitor only* (persisted in localStorage), so edits can
 *     be reviewed on the real production site without changing what normal
 *     visitors see. `?preview=off` clears it.
 *
 * Until the build flag is set, the public site renders the hand-built
 * cinematic pages exactly as before — preview mode is opt-in per browser.
 */
const PREVIEW_STORAGE_KEY = "lume.preview-mode.v1";
const PREVIEW_OFF_VALUES = new Set(["off", "0", "false", "no"]);

// Shared, non-secret gate value. It only reveals already-public (published)
// page content, so this guards against accidental exposure, not attackers.
const PREVIEW_TOKEN =
  (import.meta.env.VITE_PREVIEW_TOKEN as string | undefined)?.trim() || "lume";

function computePreviewMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const param = new URLSearchParams(window.location.search).get("preview");
    if (param !== null) {
      if (PREVIEW_OFF_VALUES.has(param.toLowerCase())) {
        window.localStorage.removeItem(PREVIEW_STORAGE_KEY);
        return false;
      }
      if (param === PREVIEW_TOKEN) {
        window.localStorage.setItem(PREVIEW_STORAGE_KEY, "on");
        return true;
      }
    }
    return window.localStorage.getItem(PREVIEW_STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

/** True when the current viewer has opted into preview mode. */
export const isPreviewModeActive = computePreviewMode();

export const isPageRendererEnabled =
  import.meta.env.VITE_PAGE_RENDERER === "true" || isPreviewModeActive;
