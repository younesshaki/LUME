"use client";

/**
 * Branded route-transition loader for the admin dashboard.
 *
 * Purpose is PERCEIVED PERFORMANCE, not decoration:
 *  - Fast navigations (the majority, thanks to App Router prefetch) resolve
 *    before SHOW_DELAY and show NOTHING — the click feels instant.
 *  - Slower navigations get a smooth blurred cover with the LUME mark; the
 *    destination route streams/renders underneath the whole time.
 *  - The mark only starts spinning after SPIN_DELAY, so a merely-slow page gets
 *    a calm cover, not a frantic spinner.
 *
 * Design notes:
 *  - Gated behind NEXT_PUBLIC_ADMIN_NAV_LOADER === "true" (ships dark).
 *  - The overlay's visible/spinning state lives in a plain controller object and
 *    is pushed to ONE subscriber (the overlay). The admin shell subtree never
 *    re-renders on show/hide, so this adds no per-navigation React cost.
 *  - Navigation START is detected by a capture-phase click listener on internal
 *    <a> links (covers the whole sidebar/breadcrumbs/in-page links with zero
 *    per-link changes) plus an explicit start() for programmatic router.push.
 *    Navigation END is the pathname settling. A max-duration timer is a safety
 *    net so the cover can never get stuck.
 *  - Pure CSS animation (GPU compositor); the logo is a 10 KB webp kept in the
 *    DOM so it is cached before the first navigation ever needs it.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const SHOW_DELAY = 150; // don't show for navigations faster than this (no flicker)
const SPIN_DELAY = 1200; // logo begins spinning only after this (from click)
const MIN_VISIBLE = 350; // once shown, stay at least this long (no ugly flash-out)
const MAX_DURATION = 10000; // safety: force-hide if a navigation never settles

const LOADER_ENABLED = process.env.NEXT_PUBLIC_ADMIN_NAV_LOADER === "true";

type LoaderState = { visible: boolean; spinning: boolean };
type Subscriber = (state: LoaderState) => void;

type LoaderController = {
  start: () => void;
  finish: () => void;
  subscribe: (fn: Subscriber) => () => void;
  getState: () => LoaderState;
};

function createController(): LoaderController {
  const subscribers = new Set<Subscriber>();
  let state: LoaderState = { visible: false, spinning: false };
  let active = false;
  let shownAt = 0;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let spinTimer: ReturnType<typeof setTimeout> | undefined;
  let maxTimer: ReturnType<typeof setTimeout> | undefined;
  let outroTimer: ReturnType<typeof setTimeout> | undefined;

  const notify = () => subscribers.forEach((fn) => fn(state));
  const set = (patch: Partial<LoaderState>) => {
    const next = { ...state, ...patch };
    if (next.visible === state.visible && next.spinning === state.spinning) return;
    state = next;
    notify();
  };
  const clearAll = () => {
    clearTimeout(showTimer);
    clearTimeout(spinTimer);
    clearTimeout(maxTimer);
    clearTimeout(outroTimer);
  };

  const start = () => {
    clearAll();
    active = true;
    // Keep an already-visible cover in place across chained navigations rather
    // than flashing it off/on.
    if (!state.visible) {
      showTimer = setTimeout(() => {
        shownAt = Date.now();
        set({ visible: true });
      }, SHOW_DELAY);
    }
    spinTimer = setTimeout(() => set({ spinning: true }), SPIN_DELAY);
    maxTimer = setTimeout(() => finish(), MAX_DURATION);
  };

  const finish = () => {
    if (!active) return;
    active = false;
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

  return {
    start,
    finish,
    subscribe: (fn) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    getState: () => state,
  };
}

const NavLoaderContext = createContext<{ start: () => void }>({ start: () => {} });

/** Trigger the loader for a programmatic navigation (call right before router.push). */
export function useNavLoader() {
  return useContext(NavLoaderContext);
}

export function NavLoaderProvider({ children }: { children: React.ReactNode }) {
  const controllerRef = useRef<LoaderController | null>(null);
  if (!controllerRef.current) controllerRef.current = createController();
  const controller = controllerRef.current;
  const pathname = usePathname();

  // Navigation END: the committed pathname changed.
  useEffect(() => {
    if (!LOADER_ENABLED) return;
    controller.finish();
    // Intentionally keyed on pathname only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Navigation START: capture-phase listener catches every internal <a> click.
  useEffect(() => {
    if (!LOADER_ENABLED) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href) return;
      if (anchor.hasAttribute("download")) return;
      const target = anchor.getAttribute("target");
      if (target && target !== "_self") return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      // Same page (or pure hash/query change): the pathname won't settle, so
      // don't start — avoids a stuck cover.
      if (url.pathname === window.location.pathname) return;
      controller.start();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [controller]);

  const value = useMemo(
    () => ({ start: LOADER_ENABLED ? controller.start : () => {} }),
    [controller],
  );

  return (
    <NavLoaderContext.Provider value={value}>
      {children}
      {LOADER_ENABLED && <NavLoaderOverlay controller={controller} />}
    </NavLoaderContext.Provider>
  );
}

function NavLoaderOverlay({ controller }: { controller: LoaderController }) {
  const [state, setState] = useState<LoaderState>(() => controller.getState());
  useEffect(() => controller.subscribe(setState), [controller]);

  return (
    <div
      className="nav-loader bg-background/70"
      data-state={state.visible ? "visible" : "hidden"}
      data-spin={state.spinning ? "true" : "false"}
      role="status"
      aria-live="polite"
      aria-hidden={!state.visible}
    >
      <span className="sr-only">Loading</span>
      {/* Kept mounted so the browser caches it before the first navigation. */}
      <img
        className="nav-loader__logo"
        src="/brand/loader-logo.webp"
        alt=""
        width={112}
        height={112}
        decoding="async"
        fetchPriority="high"
        draggable={false}
      />
    </div>
  );
}
