import { useState } from "react";
import { Menu, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { InvitationCTA } from "./InvitationCTA";
import { SITE_NAV_ITEMS, type SiteScreen } from "../siteNavigation";

type MobileNavProps = {
  currentScreen: string;
  onNavigate: (screen: SiteScreen) => void;
};

export function MobileNav({ currentScreen, onNavigate }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  const handleNavigate = (screen: SiteScreen) => {
    onNavigate(screen);
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Open navigation menu"
        className="md:hidden p-2 text-white/70 hover:text-white transition-colors cursor-pointer
          focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C9A84C] rounded"
      >
        <Menu size={22} />
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-72 bg-[#080808] border-l border-[#C9A84C]/20 p-0 flex flex-col"
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
          <span className="text-xs tracking-[0.25em] uppercase text-white/40">Menu</span>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="p-1 text-white/50 hover:text-white transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>
        <nav aria-label="Mobile navigation" className="flex flex-col flex-1 px-6 pt-8 gap-1">
          {SITE_NAV_ITEMS.map((item) => {
            const isActive = currentScreen === item.screen;
            return (
              <button
                key={item.screen}
                onClick={() => handleNavigate(item.screen)}
                className={`text-left py-4 text-base tracking-[0.15em] uppercase border-b border-white/5
                  transition-colors duration-150 cursor-pointer
                  ${isActive ? "text-[#C9A84C]" : "text-white/60 hover:text-white/90"}`}
                aria-current={isActive ? "page" : undefined}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="px-6 py-8">
          <InvitationCTA onClick={() => handleNavigate("contact")} className="w-full justify-center" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
