"use client";

/**
 * PARKED — not mounted anywhere in LUME.
 *
 * The 3D concierge head was cut deliberately: it is presentation, not
 * product, and it costs ~1.9MB (Spline runtime + scene) for a decorative
 * avatar. The files are kept — and still type-check and build — so it can be
 * revived without archaeology. See docs/parked/concierge-robot.md.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import type { Application } from "@splinetool/runtime";

import { useConciergeRobot } from "@/components/concierge-robot-provider";
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

/** Arrival from the bottom-right corner: rises past the edge of the screen. */
const OFF_CORNER = { y: "135%", rotate: 8, scale: 1, opacity: 0 };
/** Arrival in the sidebar: a short rise, so it never covers the account footer. */
const OFF_SLOT = { y: "40%", rotate: 0, scale: 0.92, opacity: 0 };
const ON_SCREEN = { y: "0%", rotate: 0, scale: 1, opacity: 1 };

/** Gliding between the sidebar and the corner. */
const MOVE = { type: "spring", stiffness: 210, damping: 26, mass: 1 } as const;

const ROBOT_SIZE = 220;
const CORNER_INSET = 16;
const SLOT_INSET = 8;
/** Below this the sidebar gap is too cramped; fall back to the corner. */
const MIN_SLOT_HEIGHT = 200;

type Anchor = { left: number; top: number; inSlot: boolean };

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
 *
 * By default it parks in the sidebar's spare space, below the nav and above
 * the account footer. Expanding a sidebar group claims that space, so the head
 * glides back to the bottom-right corner until the group is collapsed again.
 */
export function ConciergeRobotCompanion() {
  const pathname = usePathname();
  const { enabled, slot, parked } = useConciergeRobot();
  const dockRef = useRef<HTMLDivElement>(null);
  const disposeTrackingRef = useRef<(() => void) | null>(null);

  const [entered, setEntered] = useState(false);
  const [environmentAllows, setEnvironmentAllows] = useState(false);
  const [hiddenByUser, setHiddenByUser] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const onRoute = enabled && isCompanionRoute(pathname);

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

  // Where the head should sit: the sidebar's spare space when it's free and
  // big enough, otherwise the bottom-right corner.
  const computeAnchor = useCallback((): Anchor => {
    if (parked && slot) {
      const rect = slot.getBoundingClientRect();
      if (rect.height >= MIN_SLOT_HEIGHT && rect.width >= ROBOT_SIZE) {
        return {
          left: rect.right - ROBOT_SIZE - SLOT_INSET,
          top: rect.bottom - ROBOT_SIZE,
          inSlot: true,
        };
      }
    }
    return {
      left: window.innerWidth - ROBOT_SIZE - CORNER_INSET,
      top: window.innerHeight - ROBOT_SIZE,
      inSlot: false,
    };
  }, [parked, slot]);

  useEffect(() => {
    if (!onRoute || !environmentAllows) return;

    const update = () => setAnchor(computeAnchor());
    update();

    window.addEventListener("resize", update);
    // Capture phase so scrolling the sidebar itself is picked up too.
    window.addEventListener("scroll", update, true);

    // The sidebar animates its width when collapsed, and the slot resizes as
    // groups expand — both need to re-anchor as they go, not just at the end.
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (slot) observer?.observe(slot);
    observer?.observe(document.body);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      observer?.disconnect();
    };
  }, [computeAnchor, slot, onRoute, environmentAllows]);

  const visible = entered && !hiddenByUser && !dialogOpen;
  const resting = anchor?.inSlot ? OFF_SLOT : OFF_CORNER;

  const handleLoad = useCallback((app: Application) => {
    frameHeadOnly(app, COMPANION_FRAMING);
    disposeTrackingRef.current?.();
    if (dockRef.current) disposeTrackingRef.current = trackPointer(app, dockRef.current);
  }, []);

  useEffect(() => () => disposeTrackingRef.current?.(), []);

  return (
    <AnimatePresence>
      {onRoute && environmentAllows && anchor && (
        // Outer element owns *where* the head is and glides between anchors;
        // the inner one owns the arrival animation. Keeping them separate lets
        // the head move house without interrupting its pop-in.
        <motion.div
          ref={dockRef}
          // Very high z-index by request. Safe because nothing here is
          // interactive — see `pointer-events-none`.
          className="pointer-events-none fixed z-[120] hidden md:block"
          style={{ width: ROBOT_SIZE, height: ROBOT_SIZE }}
          initial={{ left: anchor.left, top: anchor.top }}
          animate={{ left: anchor.left, top: anchor.top, transition: MOVE }}
          aria-hidden="true"
        >
          <motion.div
            className="relative size-full origin-bottom"
            initial={resting}
            animate={
              visible
                ? { ...ON_SCREEN, transition: POP_IN }
                : { ...resting, transition: DUCK_OUT }
            }
            exit={{ ...resting, transition: DUCK_OUT }}
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
                  <kbd className="rounded bg-background/25 px-1 font-sans">H</kbd>{" "}
                  to hide
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
