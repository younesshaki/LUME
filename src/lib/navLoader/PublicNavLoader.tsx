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

  const start = () => {
    clearAll();
    active = true;
    if (!state.visible) {
      showTimer = setTimeout(() => {
        shownAt = Date.now();
        set({ visible: true });
      }, SHOW_DELAY);
    }
    spinTimer = setTimeout(() => set({ spinning: true }), SPIN_DELAY);
    maxTimer = setTimeout(() => finish(), MAX_DURATION);
  };

  return {
    start,
    finish,
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
      if (url.pathname === window.location.pathname) return; // same page / hash / query
      controller.start();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
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
    controller.finish();
  }, [location.pathname]);
  return null;
}
