/**
 * Branded route-transition loader for the PUBLIC tenant website.
 *
 * DETERMINISTIC by design: every in-app navigation shows the cover for a FIXED
 * duration, regardless of how fast the page actually loads — so it can never be
 * "hit or miss". Default 500ms; the inventory (/vehicles) holds 2000ms. On by
 * default per tenant (opt-out via tenants.theme.navLoader.enabled).
 *
 * Nav START is react-router's useLocation() pathname change (detected outside
 * the routes' Suspense, so it fires the moment navigation begins — link,
 * programmatic navigate(), or back/forward). Overlay state lives in a module
 * singleton pushed to one subscriber; the app never re-renders on show/hide.
 * The cover is portaled to <body> so the cinematic app's transforms can't trap
 * or hide it.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useTenantTheme } from "../TenantThemeProvider";
import { loadNavLoaderEnabled } from "./navLoaderConfig";

const DEFAULT_DURATION = 500;
const VEHICLES_DURATION = 3000;
const FALLBACK_LOGO = "/brand/loader-logo.png";

/** How long the cover stays up for a navigation to `pathname`. */
function durationForPath(pathname: string): number {
  return pathname.startsWith("/vehicles") ? VEHICLES_DURATION : DEFAULT_DURATION;
}

type Subscriber = (visible: boolean) => void;

function createController() {
  const subscribers = new Set<Subscriber>();
  let visible = false;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  const setVisible = (next: boolean) => {
    if (next === visible) return;
    visible = next;
    subscribers.forEach((fn) => fn(visible));
  };

  return {
    start(durationMs: number) {
      clearTimeout(hideTimer);
      setVisible(true);
      hideTimer = setTimeout(() => setVisible(false), durationMs);
    },
    subscribe(fn: Subscriber) {
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },
    getVisible: () => visible,
  };
}

const controller = createController();

export function PublicNavLoader() {
  const theme = useTenantTheme();
  const location = useLocation();
  // On by default (optimistic); the async check only turns it OFF if a tenant
  // has opted out.
  const [enabled, setEnabled] = useState(true);
  const previousPathRef = useRef<string | null>(null);

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
    if (!enabled) {
      previousPathRef.current = location.pathname;
      return;
    }
    // Skip the first run (initial page load) so we never cover the first paint.
    if (previousPathRef.current === null) {
      previousPathRef.current = location.pathname;
      return;
    }
    if (previousPathRef.current !== location.pathname) {
      previousPathRef.current = location.pathname;
      controller.start(durationForPath(location.pathname));
    }
  }, [enabled, location.pathname]);

  if (!enabled) return null;
  return <NavLoaderOverlay logo={theme.branding?.logoUrl ?? FALLBACK_LOGO} />;
}

function NavLoaderOverlay({ logo }: { logo: string }) {
  const [visible, setVisible] = useState(() => controller.getVisible());
  useEffect(() => controller.subscribe(setVisible), []);

  return createPortal(
    <div
      className="nav-loader"
      data-state={visible ? "visible" : "hidden"}
      role="status"
      aria-live="polite"
      aria-hidden={!visible}
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
          if (!img.src.endsWith(FALLBACK_LOGO)) img.src = FALLBACK_LOGO;
        }}
      />
    </div>,
    document.body,
  );
}
