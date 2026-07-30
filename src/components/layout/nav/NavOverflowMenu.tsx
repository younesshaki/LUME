import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { SiteNavItem } from "../siteNavigation";

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
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const containsActive = items.some((item) => item.screen === currentScreen);

  // Close on outside pointer or Escape, and return focus to the trigger so
  // keyboard users are not dropped at the top of the document.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
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

  // Move focus into the panel on open so the menu is operable from the keyboard.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [open]);

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

      {open && (
        <div
          ref={panelRef}
          id={menuId}
          role="group"
          aria-label="More navigation"
          className="absolute right-0 top-full mt-3 min-w-[12rem] rounded-md border
            border-[var(--theme-lume-line,rgba(255,255,255,.12))]
            bg-[var(--theme-lume-panel,rgba(12,12,12,.96))]
            backdrop-blur-md shadow-xl py-1 z-50"
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
                className={`block w-full text-left px-4 py-2 text-sm tracking-widest uppercase
                  transition-colors duration-150 cursor-pointer
                  ${active
                    ? "text-[var(--theme-lume-gold,#C9A84C)]"
                    : "text-[var(--theme-lume-muted,rgba(255,255,255,.7))] hover:text-[var(--theme-lume-ink,#fff)]"}
                  hover:bg-[var(--theme-lume-soft,rgba(255,255,255,.06))]`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
