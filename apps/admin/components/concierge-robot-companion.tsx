"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import type { Application } from "@splinetool/runtime";

import { SplineScene } from "@/components/ui/spline-scene";
import {
  COMPANION_FRAMING,
  CONCIERGE_SCENE_URL,
  frameHeadOnly,
  isCompanionRoute,
  trackPointer,
} from "@/lib/conciergeRobot";

const HINT_SEEN_KEY = "lume.concierge-robot.hint-seen";

/** Springy arrival: overshoots slightly, then settles. */
const POP_IN = { type: "spring", stiffness: 240, damping: 17, mass: 0.9 } as const;
/** Leaving is a plain duck-out — no bounce on the way down. */
const DUCK_OUT = { duration: 0.32, ease: [0.4, 0, 1, 1] } as const;

const OFF_SCREEN = { y: "135%", rotate: 8, opacity: 0 };
const ON_SCREEN = { y: "0%", rotate: 0, opacity: 1 };

/**
 * The concierge head, docked bottom-right on every admin page except the
 * tenant overview (where the hero card already shows it).
 *
 * It lives in the admin shell, so it survives route changes — a navigation
 * only replays the pop-in animation rather than reloading the scene. The
 * container is `pointer-events-none`, and tracking is driven from a `window`
 * listener, so the head follows the cursor anywhere on the page without ever
 * intercepting a click. `h` ducks it out of frame anyway, and it gets out of
 * the way on its own while a dialog is open.
 */
export function ConciergeRobotCompanion() {
  const pathname = usePathname();
  const dockRef = useRef<HTMLDivElement>(null);
  const disposeTrackingRef = useRef<(() => void) | null>(null);

  const [entered, setEntered] = useState(false);
  const [environmentAllows, setEnvironmentAllows] = useState(false);
  const [hiddenByUser, setHiddenByUser] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const onRoute = isCompanionRoute(pathname);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const wideEnough = window.matchMedia("(min-width: 768px)");
    const sync = () => setEnvironmentAllows(!reducedMotion.matches && wideEnough.matches);

    sync();
    reducedMotion.addEventListener("change", sync);
    wideEnough.addEventListener("change", sync);
    return () => {
      reducedMotion.removeEventListener("change", sync);
      wideEnough.removeEventListener("change", sync);
    };
  }, []);

  // `h` ducks the head out of frame when it sits over something the user
  // wants to click. Ignored while typing, or when it's a browser shortcut.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "h" && event.key !== "H") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        /^(input|textarea|select)$/i.test(target?.tagName ?? "")
      ) {
        return;
      }
      setHiddenByUser((hidden) => !hidden);
      setShowHint(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // A floating head on top of an open dialog reads as a bug, so step aside.
  useEffect(() => {
    const selector =
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]';
    const check = () => setDialogOpen(Boolean(document.querySelector(selector)));

    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "role"],
    });
    return () => observer.disconnect();
  }, []);

  // Every navigation replays the arrival: drop below the fold for a frame,
  // then pop back up. Two frames so the off-screen state actually paints —
  // setting and clearing in one tick would batch into no movement at all.
  useEffect(() => {
    if (!onRoute || !environmentAllows) return;

    setEntered(false);
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [pathname, onRoute, environmentAllows]);

  // First time the head ever shows up, say how to get rid of it.
  useEffect(() => {
    if (!entered || hiddenByUser || dialogOpen) return;
    if (window.localStorage.getItem(HINT_SEEN_KEY)) return;

    window.localStorage.setItem(HINT_SEEN_KEY, "1");
    setShowHint(true);
    const timer = window.setTimeout(() => setShowHint(false), 4200);
    return () => window.clearTimeout(timer);
  }, [entered, hiddenByUser, dialogOpen]);

  const visible = entered && !hiddenByUser && !dialogOpen;

  const handleLoad = useCallback((app: Application) => {
    frameHeadOnly(app, COMPANION_FRAMING);
    disposeTrackingRef.current?.();
    if (dockRef.current) disposeTrackingRef.current = trackPointer(app, dockRef.current);
  }, []);

  useEffect(() => () => disposeTrackingRef.current?.(), []);

  return (
    <AnimatePresence>
      {onRoute && environmentAllows && (
        <motion.div
          ref={dockRef}
          // Very high z-index by request. Safe because nothing here is
          // interactive — see `pointer-events-none` below.
          className="pointer-events-none fixed bottom-0 right-4 z-[120] hidden h-[220px] w-[220px] origin-bottom md:block"
          initial={OFF_SCREEN}
          animate={
            visible
              ? { ...ON_SCREEN, transition: POP_IN }
              : { ...OFF_SCREEN, transition: DUCK_OUT }
          }
          exit={{ ...OFF_SCREEN, transition: DUCK_OUT }}
          aria-hidden="true"
        >
          {/* Grounding glow, so the head doesn't look pasted onto the page. */}
          <div className="absolute inset-x-4 bottom-0 h-16 rounded-[50%] bg-foreground/10 blur-2xl dark:bg-white/10" />

          <SplineScene
            scene={CONCIERGE_SCENE_URL}
            className="size-full"
            onLoad={handleLoad}
          />

          <AnimatePresence>
            {showHint && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                className="absolute bottom-6 right-full mr-1 whitespace-nowrap rounded-full bg-foreground/90 px-2.5 py-1 text-xs font-medium text-background shadow-sm"
              >
                Press{" "}
                <kbd className="rounded bg-background/25 px-1 font-sans">H</kbd> to
                hide
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
