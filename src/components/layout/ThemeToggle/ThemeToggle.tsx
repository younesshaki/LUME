import { useCallback, useRef } from "react";
import { flushSync } from "react-dom";
import { Moon, Sun } from "lucide-react";
import { useTenantSiteDesign } from "@/lib/TenantThemeProvider";
import { applyTenantSiteDesign } from "@/lib/tenantTheme";
import { useTheme } from "@/lib/theme/ThemeContext";
import { maxRevealRadius } from "@/lib/theme/themeTransition";
import type { ThemeMode } from "@/lib/theme/theme";
import "./ThemeToggle.css";

const TRANSITION_DURATION_MS = 350;

type ViewTransition = { ready: Promise<void>; finished: Promise<void> };
type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => ViewTransition;
};

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Compact public theme control. The reveal uses the browser-native View
 * Transitions API: the browser snapshots the current render (no DOM cloning,
 * no font re-download, no sandboxed-iframe scripts), and we animate a circular
 * clip-path from the button. Browsers without it apply the theme instantly.
 */
export function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const siteDesign = useTenantSiteDesign();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inFlightRef = useRef(false);
  const nextTheme: ThemeMode = mode === "dark" ? "light" : "dark";

  // Latest values, read at click time, so the callback stays stable.
  const nextThemeRef = useRef(nextTheme);
  nextThemeRef.current = nextTheme;
  const setModeRef = useRef(setMode);
  setModeRef.current = setMode;
  const siteDesignRef = useRef(siteDesign);
  siteDesignRef.current = siteDesign;

  const toggleTheme = useCallback(() => {
    const button = buttonRef.current;
    if (!button || inFlightRef.current) return;
    const next = nextThemeRef.current;

    // Apply the theme synchronously so a View Transition snapshots the final
    // render: data-theme (ThemeContext layout effect) + tenant colors/background.
    const commit = () => {
      flushSync(() => setModeRef.current(next));
      const design = siteDesignRef.current;
      if (design) applyTenantSiteDesign(design, next);
    };

    const doc = document as ViewTransitionDocument;
    if (
      prefersReducedMotion() ||
      typeof doc.startViewTransition !== "function" ||
      typeof document.documentElement.animate !== "function"
    ) {
      commit();
      return;
    }

    inFlightRef.current = true;
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

    const transition = doc.startViewTransition!(commit);
    transition.ready
      .then(() => {
        root.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${radius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: TRANSITION_DURATION_MS,
            easing: "ease-in-out",
            pseudoElement: "::view-transition-new(root)",
          }
        );
      })
      .catch(() => {
        // A skipped/interrupted transition still committed the theme.
      });
    transition.finished
      .catch(() => {})
      .finally(() => {
        inFlightRef.current = false;
      });
  }, []);

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
