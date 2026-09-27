import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import type { SiteNavItem } from "../siteNavigation";
import { overflowPanelPosition } from "./navOverflow";

/** The panel's `min-w-[12rem]`, used before it has rendered and can be measured. */
const PANEL_MIN_WIDTH = 192;

type NavOverflowMenuProps = {
  items: readonly SiteNavItem[];
  currentScreen: string;
  onNavigate: (screen: string) => void;
  onIntent?: (screen: string) => void;
  triggerRef: React.RefObject<HTMLButtonElement>;
};

/**
 * The "More" menu holding nav items that do not fit inline.
 *
 * Deliberately a small self-contained disclosure rather than a new dependency:
 * it needs click-outside, Escape, roving focus and correct aria wiring, all of
 * which are cheap here, and the header is the one component on every page — an
 * extra menu library on the critical path is not worth it.
 */
export function NavOverflowMenu({
  items,
  currentScreen,
  onNavigate,
  onIntent,
  triggerRef,
}: NavOverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const containsActive = items.some((item) => item.screen === currentScreen);

  /**
   * The panel is portalled to <body> and positioned from the trigger's rect.
   *
   * It cannot be a normal absolutely-positioned child: the header clips its
   * overflow, and it must. The gooey nav's filter draws a solid black backdrop
   * inset -75px around the active tab — required for its blur+contrast
   * threshold — and without the clip that slab spills below the header and
   * covers the page. So the header keeps `overflow-hidden` and this escapes it.
   */
  const positionPanel = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next = overflowPanelPosition({
      trigger: rect,
      panelWidth: panelRef.current?.offsetWidth || PANEL_MIN_WIDTH,
      viewportWidth: window.innerWidth,
    });
    setAnchor((previous) =>
      previous && previous.top === next.top && previous.left === next.left ? previous : next,
    );
  }, [triggerRef]);

  // Any navigation closes the menu — not only picking one of its items, but
  // also back/forward and concierge-driven moves, which never touch it.
  const location = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [location.key]);

  // Close on outside pointer or Escape, and return focus to the trigger so
  // keyboard users are not dropped at the top of the document.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      // The panel is portalled to <body>, so it is NOT inside containerRef.
      // Checking only the container treated a press on a menu item as an
      // outside click and unmounted the panel before the click landed: mouse
      // and touch users could open "More" but never follow its links.
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, triggerRef]);

  // Position before paint so the panel never appears at the wrong place first.
  // Re-run once the panel exists, so a label wider than the min-width is
  // measured rather than assumed.
  useLayoutEffect(() => {
    if (open) positionPanel();
  }, [open, anchor, positionPanel]);

  // The header is fixed, so the trigger moves with the viewport, not the page.
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", positionPanel);
    window.addEventListener("scroll", positionPanel, { passive: true });
    return () => {
      window.removeEventListener("resize", positionPanel);
      window.removeEventListener("scroll", positionPanel);
    };
  }, [open, positionPanel]);

  // Move focus into the panel on open so the menu is operable from the keyboard.
  // The panel only mounts once it has a position, which is after `open` flips,
  // so wait for it to exist and move focus exactly once per opening.
  const focusedOnOpen = useRef(false);
  useEffect(() => {
    if (!open) {
      focusedOnOpen.current = false;
      return;
    }
    if (focusedOnOpen.current || !panelRef.current) return;
    focusedOnOpen.current = true;
    panelRef.current.querySelector<HTMLButtonElement>("button")?.focus();
  }, [open, anchor]);

  if (items.length === 0) return null;

  return (
    <div ref={containerRef} className="relative flex items-center">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex items-center gap-1 px-1 py-0.5 text-sm tracking-widest uppercase
          transition-colors duration-200 cursor-pointer whitespace-nowrap
          ${containsActive
            ? "text-[var(--theme-lume-gold,#C9A84C)]"
            : "text-[var(--theme-lume-muted,rgba(255,255,255,.6))] hover:text-[var(--theme-lume-ink,#fff)]"}`}
      >
        More
        <ChevronDown
          aria-hidden="true"
          className={`h-3 w-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && anchor && createPortal(
        <div
          ref={panelRef}
          id={menuId}
          role="group"
          aria-label="More navigation"
          style={{ position: "fixed", top: anchor.top, left: anchor.left }}
          className="min-w-[12rem] rounded-md border
            border-[var(--theme-lume-line,rgba(255,255,255,.12))]
            bg-[var(--theme-lume-panel,rgba(12,12,12,.96))]
            backdrop-blur-md shadow-xl py-1 z-[60]"
        >
          {items.map((item) => {
            const active = item.screen === currentScreen;
            return (
              <button
                key={item.screen}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onNavigate(item.screen);
                }}
                onMouseEnter={() => onIntent?.(item.screen)}
                onFocus={() => onIntent?.(item.screen)}
                aria-current={active ? "page" : undefined}
                className={`relative block w-full text-left px-4 py-2 text-sm tracking-widest uppercase
                  transition-colors duration-150 cursor-pointer
                  before:absolute before:left-1.5 before:top-1/2 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full
                  ${active
                    ? "font-semibold text-[var(--theme-lume-gold,#C9A84C)] before:bg-[var(--theme-lume-gold,#C9A84C)]"
                    : "text-[var(--theme-lume-muted,rgba(255,255,255,.7))] hover:text-[var(--theme-lume-ink,#fff)] before:bg-transparent"}
                  hover:bg-[var(--theme-lume-soft,rgba(255,255,255,.06))]`}
              >
                {item.label}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
