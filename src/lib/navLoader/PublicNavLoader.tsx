/**
 * Branded route-transition loader for the PUBLIC tenant website.
 *
 * Same perceived-performance design as the admin loader (show@150 / spin@1.2s /
 * min-visible@350 / outro@240), ported to the public stack:
 *  - Nav START: a capture-phase click listener on internal links.
 *  - Nav END: <NavLoaderSettle/> lives INSIDE the routes' Suspense boundary, so
 *    it only commits after the next lazy route resolves — masking the real gap.
 *  - Per-tenant: only active when the tenant enabled it (tenants.theme.navLoader).
 *  - Logo: the tenant's own branding logo, falling back to the LUME mark.
 *
 * The overlay state lives in a module-singleton controller pushed to one
 * subscriber; the app tree never re-renders on show/hide. Pure CSS animation.
 */
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTenantTheme } from "../TenantThemeProvider";
import { loadNavLoaderEnabled } from "./navLoaderConfig";

const SHOW_DELAY = 150;
const SPIN_DELAY = 1200;
const MIN_VISIBLE = 350;
const MAX_DURATION = 10000;
const CONTENT_HOLD_CAP = 2500; // max time a page may hold the cover for its data
const FALLBACK_LOGO = "/brand/loader-logo.png";

type LoaderState = { visible: boolean; spinning: boolean };
type Subscriber = (state: LoaderState) => void;

function createController() {
  const subscribers = new Set<Subscriber>();
  let state: LoaderState = { visible: false, spinning: false };
  let active = false;
  let shownAt = 0;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let spinTimer: ReturnType<typeof setTimeout> | undefined;
  let maxTimer: ReturnType<typeof setTimeout> | undefined;
  let outroTimer: ReturnType<typeof setTimeout> | undefined;
  const holds = new Set<number>();
  let holdSeq = 0;
  let routeReady = false;

  const set = (patch: Partial<LoaderState>) => {
    const next = { ...state, ...patch };
    if (next.visible === state.visible && next.spinning === state.spinning) return;
    state = next;
    subscribers.forEach((fn) => fn(state));
  };
  const clearAll = () => {
    clearTimeout(showTimer);
    clearTimeout(spinTimer);
    clearTimeout(maxTimer);
    clearTimeout(outroTimer);
  };

  const performFinish = () => {
    if (!active) return;
    active = false;
    routeReady = false;
    holds.clear();
    clearTimeout(showTimer);
    clearTimeout(spinTimer);
    clearTimeout(maxTimer);
    if (!state.visible) {
      set({ visible: false, spinning: false });
      return;
    }
    const wait = Math.max(0, MIN_VISIBLE - (Date.now() - shownAt));
    outroTimer = setTimeout(() => set({ visible: false, spinning: false }), wait);
  };

  // Hide only once the route has committed AND no page is still holding the
  // cover for its data.
  const maybeFinish = () => {
    if (active && routeReady && holds.size === 0) performFinish();
  };

  // Called when the next route has actually rendered (from inside Suspense). A
  // microtask defer lets same-commit holds register before we decide to hide.
  const routeSettled = () => {
    routeReady = true;
    queueMicrotask(maybeFinish);
  };

  // A data-heavy page keeps the cover up until its content is ready. Auto-
  // released after CONTENT_HOLD_CAP so slow data falls back to the page's own
  // skeletons instead of a stuck cover.
  const acquireHold = () => {
    const id = ++holdSeq;
    holds.add(id);
    let released = false;
    let cap: ReturnType<typeof setTimeout>;
    const release = () => {
      if (released) return;
      released = true;
      clearTimeout(cap);
      holds.delete(id);
      maybeFinish();
    };
    cap = setTimeout(release, CONTENT_HOLD_CAP);
    return release;
  };

  const start = () => {
    clearAll();
    active = true;
    routeReady = false;
    holds.clear();
    if (!state.visible) {
      showTimer = setTimeout(() => {
        shownAt = Date.now();
        set({ visible: true });
      }, SHOW_DELAY);
    }
    spinTimer = setTimeout(() => set({ spinning: true }), SPIN_DELAY);
    maxTimer = setTimeout(() => performFinish(), MAX_DURATION);
  };

  return {
    start,
    routeSettled,
    acquireHold,
    subscribe: (fn: Subscriber) => {
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },
    getState: () => state,
  };
}

const controller = createController();

/**
 * Mount inside the tenant theme provider (persistent, outside the routes'
 * Suspense). Installs the click interceptor and renders the overlay only when
 * the tenant has enabled the loader.
 */
export function PublicNavLoader() {
  const theme = useTenantTheme();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;
    void loadNavLoaderEnabled().then((value) => {
      if (mounted) setEnabled(value);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // The public header/dock navigate programmatically (react-router
    // useNavigate → history), not via <a>. Patch pushState/replaceState so we
    // catch every in-app navigation — link clicks AND programmatic — and only
    // start the cover when the pathname actually changes.
    const original = {
      push: window.history.pushState.bind(window.history),
      replace: window.history.replaceState.bind(window.history),
    };
    const wrap = (orig: History["pushState"]): History["pushState"] =>
      function patched(this: History, ...args: Parameters<History["pushState"]>) {
        const before = window.location.pathname;
        const result = orig(...args);
        try {
          const nextUrl = args[2];
          if (nextUrl != null) {
            const next = new URL(String(nextUrl), window.location.href);
            if (next.origin === window.location.origin && next.pathname !== before) {
              controller.start();
            }
          }
        } catch {
          // A malformed URL simply means no cover — never break navigation.
        }
        return result;
      };
    window.history.pushState = wrap(original.push);
    window.history.replaceState = wrap(original.replace);
    return () => {
      window.history.pushState = original.push;
      window.history.replaceState = original.replace;
    };
  }, [enabled]);

  if (!enabled) return null;
  return <NavLoaderOverlay logo={theme.branding?.logoUrl ?? FALLBACK_LOGO} />;
}

function NavLoaderOverlay({ logo }: { logo: string }) {
  const [state, setState] = useState<LoaderState>(() => controller.getState());
  useEffect(() => controller.subscribe(setState), []);

  return (
    <div
      className="nav-loader"
      data-state={state.visible ? "visible" : "hidden"}
      data-spin={state.spinning ? "true" : "false"}
      role="status"
      aria-live="polite"
      aria-hidden={!state.visible}
    >
      <span className="nav-loader__sr">Loading</span>
      <img
        className="nav-loader__logo"
        src={logo}
        alt=""
        width={112}
        height={112}
        decoding="async"
        draggable={false}
        onError={(event) => {
          const img = event.currentTarget;
          if (img.src.endsWith(FALLBACK_LOGO)) return;
          img.src = FALLBACK_LOGO;
        }}
      />
    </div>
  );
}

/**
 * Place INSIDE the routes' <Suspense> boundary. It only commits once the next
 * lazy route has resolved, which is the correct moment to end the cover.
 */
export function NavLoaderSettle() {
  const location = useLocation();
  useEffect(() => {
    controller.routeSettled();
  }, [location.pathname]);
  return null;
}

/**
 * Data-heavy pages/blocks call this to hold the cover open until their first
 * meaningful content is ready. Pass the page's own loading flag; the cover
 * lifts when it flips false (or after the controller's content-hold cap).
 * When no navigation is in flight the hold is a harmless no-op.
 */
export function useNavLoaderHold(isLoading: boolean) {
  useEffect(() => {
    if (!isLoading) return;
    const release = controller.acquireHold();
    return release;
  }, [isLoading]);
}
