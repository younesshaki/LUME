import { useCallback, useEffect, useRef } from "react";
import { Moon, Sun } from "lucide-react";
import { useTenantSiteDesign } from "@/lib/TenantThemeProvider";
import {
  getTenantSiteDesignStyles,
  TENANT_THEME_CSS_VARIABLES,
} from "@/lib/tenantTheme";
import { useTheme } from "@/lib/theme/ThemeContext";
import {
  buildThemeSnapshotMarkup,
  getThemeTransitionClipPaths,
  maxRevealRadius,
  rootMatchesTheme,
} from "@/lib/theme/themeTransition";
import type { ThemeMode } from "@/lib/theme/theme";
import "./ThemeToggle.css";

type RevealSession = {
  controller: AbortController;
  overlay: HTMLDivElement | null;
  animation: Animation | null;
};

const TRANSITION_DURATION_MS = 350;
const SNAPSHOT_LOAD_TIMEOUT_MS = 1_500;
const THEME_APPLY_TIMEOUT_MS = 500;

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function waitForSnapshotLoad(
  iframe: HTMLIFrameElement,
  theme: ThemeMode,
  signal: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Theme reveal aborted", "AbortError"));
      return;
    }

    let settled = false;
    let timeout = 0;
    let readinessFrame = 0;
    const cleanup = () => {
      window.clearTimeout(timeout);
      cancelAnimationFrame(readinessFrame);
      iframe.removeEventListener("load", checkReady);
      iframe.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
    };
    const checkReady = () => {
      if (settled) return;
      try {
        if (iframe.contentDocument?.documentElement.dataset.themeRevealSnapshot === theme) {
          settled = true;
          cleanup();
          resolve();
          return;
        }
      } catch {
        // A restrictive frame policy falls through to the safe timeout.
      }
      readinessFrame = requestAnimationFrame(checkReady);
    };
    const onError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Theme snapshot failed to load"));
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException("Theme reveal aborted", "AbortError"));
    };

    iframe.addEventListener("load", checkReady);
    iframe.addEventListener("error", onError, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
    readinessFrame = requestAnimationFrame(checkReady);
    timeout = window.setTimeout(onError, SNAPSHOT_LOAD_TIMEOUT_MS);
  });
}

function waitForAnimation(
  animation: Animation,
  duration: number,
  signal: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Theme reveal aborted", "AbortError"));
      return;
    }

    let settled = false;
    const cleanup = () => {
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => {
      animation.cancel();
      fail(new DOMException("Theme reveal aborted", "AbortError"));
    };
    const timeout = window.setTimeout(() => {
      try {
        animation.finish();
      } finally {
        finish();
      }
    }, duration + 250);

    signal.addEventListener("abort", onAbort, { once: true });
    void animation.finished.then(finish, fail);
  });
}

function waitForThemeApplication(
  root: HTMLElement,
  theme: ThemeMode,
  signal: AbortSignal
): Promise<void> {
  if (rootMatchesTheme(root, theme)) return Promise.resolve();

  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Theme reveal aborted", "AbortError"));
      return;
    }

    let timeout = 0;
    const observer = new MutationObserver(() => {
      if (rootMatchesTheme(root, theme)) finish();
    });
    const cleanup = () => {
      observer.disconnect();
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
    };
    const finish = () => {
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Theme reveal aborted", "AbortError"));
    };

    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    signal.addEventListener("abort", onAbort, { once: true });
    timeout = window.setTimeout(finish, THEME_APPLY_TIMEOUT_MS);
  });
}

function waitForStablePaint(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Theme reveal aborted", "AbortError"));
      return;
    }

    let firstFrame = 0;
    let secondFrame = 0;
    const onAbort = () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      reject(new DOMException("Theme reveal aborted", "AbortError"));
    };

    signal.addEventListener("abort", onAbort, { once: true });
    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      });
    });
  });
}

/**
 * Compact public counterpart to the Admin dashboard's theme control. It uses
 * one iframe/clip-path reveal implementation for every browser and platform.
 */
export function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const siteDesign = useTenantSiteDesign();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inFlightRef = useRef(false);
  const sessionRef = useRef<RevealSession | null>(null);
  const nextTheme: ThemeMode = mode === "dark" ? "light" : "dark";

  const cancelSession = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    session.controller.abort();
    session.animation?.cancel();
    session.overlay?.remove();
    sessionRef.current = null;
    inFlightRef.current = false;
  }, []);

  useEffect(() => cancelSession, [cancelSession]);

  const toggleTheme = useCallback(() => {
    const button = buttonRef.current;
    if (!button || inFlightRef.current) return;

    if (
      TRANSITION_DURATION_MS <= 0 ||
      prefersReducedMotion() ||
      typeof document.documentElement.animate !== "function"
    ) {
      setMode(nextTheme);
      return;
    }

    inFlightRef.current = true;
    const session: RevealSession = {
      controller: new AbortController(),
      overlay: null,
      animation: null,
    };
    sessionRef.current = session;

    const run = async () => {
      let committed = false;
      try {
        const root = document.documentElement;
        const viewportWidth = Math.max(
          window.innerWidth,
          root.clientWidth,
          window.visualViewport?.width ?? 0
        );
        const viewportHeight = Math.max(
          window.innerHeight,
          root.clientHeight,
          window.visualViewport?.height ?? 0
        );
        const rect = button.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const radius = maxRevealRadius(x, y, viewportWidth, viewportHeight);
        const [fromClip, toClip] = getThemeTransitionClipPaths(
          "circle",
          x,
          y,
          radius,
          viewportWidth,
          viewportHeight
        );
        const overlay = document.createElement("div");
        overlay.dataset.themeRevealOverlay = "";
        overlay.setAttribute("aria-hidden", "true");
        overlay.inert = true;
        overlay.style.visibility = "hidden";
        overlay.style.clipPath = fromClip;

        const iframe = document.createElement("iframe");
        iframe.title = "";
        iframe.tabIndex = -1;
        iframe.setAttribute("aria-hidden", "true");
        iframe.setAttribute("sandbox", "allow-same-origin");
        overlay.append(iframe);
        session.overlay = overlay;

        const targetStyles = siteDesign
          ? getTenantSiteDesignStyles(siteDesign, nextTheme).variables
          : undefined;
        const loaded = waitForSnapshotLoad(iframe, nextTheme, session.controller.signal);
        document.body.append(overlay);
        iframe.srcdoc = buildThemeSnapshotMarkup(nextTheme, {
          styleOverrides: targetStyles,
          clearStyleProperties: TENANT_THEME_CSS_VARIABLES,
        });
        await loaded;
        if (session.controller.signal.aborted) return;

        try {
          iframe.contentWindow?.scrollTo(window.scrollX, window.scrollY);
        } catch {
          // Access can be unavailable under an unusually strict CSP.
        }

        await waitForStablePaint(session.controller.signal);
        overlay.style.visibility = "visible";
        void overlay.getBoundingClientRect();

        const animation = overlay.animate(
          { clipPath: [fromClip, toClip] },
          {
            duration: TRANSITION_DURATION_MS,
            easing: "ease-in-out",
            fill: "forwards",
          }
        );
        session.animation = animation;
        await waitForAnimation(animation, TRANSITION_DURATION_MS, session.controller.signal);
        if (session.controller.signal.aborted) return;

        setMode(nextTheme);
        committed = true;
        await waitForThemeApplication(root, nextTheme, session.controller.signal);
        await waitForStablePaint(session.controller.signal);
      } catch {
        if (!session.controller.signal.aborted && !committed) setMode(nextTheme);
      } finally {
        if (sessionRef.current === session) {
          session.overlay?.remove();
          sessionRef.current = null;
          inFlightRef.current = false;
        }
      }
    };

    void run();
  }, [nextTheme, setMode, siteDesign]);

  const accessibleLabel = `Switch website color theme to ${nextTheme}`;

  return (
    <button
      type="button"
      ref={buttonRef}
      className="themeToggle"
      aria-label={accessibleLabel}
      aria-pressed={mode === "dark"}
      title={accessibleLabel}
      onClick={toggleTheme}
    >
      {mode === "dark" ? (
        <Sun className="themeToggle__icon" aria-hidden="true" />
      ) : (
        <Moon className="themeToggle__icon" aria-hidden="true" />
      )}
      <span className="themeToggle__label">{accessibleLabel}</span>
    </button>
  );
}
