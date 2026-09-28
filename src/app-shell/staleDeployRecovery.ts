/**
 * Recover when a new deploy removes the code chunks an open page still needs.
 *
 * Every production deploy replaces the hashed chunk files. A visitor whose page
 * loaded from the previous build then lazy-loads a chunk that no longer exists,
 * gets the SPA's HTML instead, and the feature silently fails — seen on the
 * demo tenant (2026-09-28): the concierge chat chunk failed to load on /faq
 * right after a deploy. Vite reports this as `vite:preloadError`; reloading
 * picks up the new build.
 *
 * Reloads at most once per window, so a genuinely broken chunk cannot loop.
 */
export const STALE_DEPLOY_RELOAD_KEY = "lume.stale-deploy-reload.v1";
const RELOAD_WINDOW_MS = 60_000;

type RecoveryDeps = {
  now?: () => number;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  reload?: () => void;
};

/** Handle one chunk-load failure. Returns true when it reloads. */
export function recoverFromStaleDeploy(
  event: Pick<Event, "preventDefault">,
  { now = Date.now, storage = safeSessionStorage(), reload = () => window.location.reload() }: RecoveryDeps = {},
): boolean {
  const last = Number(storage?.getItem(STALE_DEPLOY_RELOAD_KEY) ?? 0);
  if (Number.isFinite(last) && now() - last < RELOAD_WINDOW_MS) return false;
  try {
    storage?.setItem(STALE_DEPLOY_RELOAD_KEY, String(now()));
  } catch {
    // Without storage the guard cannot persist; reloading once is still right.
  }
  event.preventDefault();
  reload();
  return true;
}

export function installStaleDeployRecovery(target: Window = window): void {
  target.addEventListener("vite:preloadError", (event) => {
    recoverFromStaleDeploy(event);
  });
}

function safeSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
