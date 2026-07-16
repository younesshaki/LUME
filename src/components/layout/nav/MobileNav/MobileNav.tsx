import { useState } from "react";
import { Menu, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { useUIStore } from "@/lib/ui-state";
import { InvitationCTA } from "../InvitationCTA";
import { SITE_NAV_ITEMS, type SiteNavItem } from "../../siteNavigation";

type MobileNavProps = {
  currentScreen: string;
  onNavigate: (screen: string) => void;
  onIntent?: (screen: string) => void;
  items?: SiteNavItem[];
  showCta?: boolean;
  ctaLabel?: string;
};

export function MobileNav({
  currentScreen,
  onNavigate,
  onIntent,
  items = SITE_NAV_ITEMS,
  showCta = true,
  ctaLabel,
}: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const setHeader = useUIStore((state) => state.setHeader);

  const setMenuOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    setHeader({ mobileMenuOpen: nextOpen });
  };

  const handleNavigate = (screen: string) => {
    onNavigate(screen);
    setMenuOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setMenuOpen}>
      <SheetTrigger
        aria-label="Open navigation menu"
        className="md:hidden p-2 text-[var(--theme-lume-muted)] hover:text-[var(--theme-lume-ink)] transition-colors cursor-pointer
          focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C9A84C] rounded"
      >
        <Menu size={22} />
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-72 bg-[var(--theme-lume-panel)] text-[var(--theme-lume-ink)] border-l border-[var(--theme-lume-line)] p-0 flex flex-col"
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--theme-lume-line)]">
          <span className="text-xs tracking-[0.25em] uppercase text-[var(--theme-lume-soft)]">Menu</span>
          <button
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
            className="p-1 text-[var(--theme-lume-muted)] hover:text-[var(--theme-lume-ink)] transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>
        <nav aria-label="Mobile navigation" className="flex flex-col flex-1 px-6 pt-8 gap-1">
          {items.map((item) => {
            const isActive = currentScreen === item.screen;
            return (
              <button
                key={item.screen}
                onClick={() => handleNavigate(item.screen)}
                onFocus={() => onIntent?.(item.screen)}
                onPointerDown={() => onIntent?.(item.screen)}
                className={`text-left py-4 text-base tracking-[0.15em] uppercase border-b border-[var(--theme-lume-line)]
                  transition-colors duration-150 cursor-pointer
                  ${isActive ? "text-[var(--theme-lume-gold)]" : "text-[var(--theme-lume-muted)] hover:text-[var(--theme-lume-ink)]"}`}
                aria-current={isActive ? "page" : undefined}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
        {showCta && (
          <div className="px-6 py-8">
            <InvitationCTA
              onClick={() => handleNavigate("contact")}
              onIntent={() => onIntent?.("contact")}
              label={ctaLabel}
              className="w-full justify-center"
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
