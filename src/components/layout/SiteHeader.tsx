import { useCurrentRoute } from "@/app-shell/useCurrentRoute";
import { useNavigation } from "@/app-shell/NavigationProvider";
import { mediaUrl } from "@/config/cdn";
import { DesktopNav } from "./nav/DesktopNav";
import { GooeyDesktopNav } from "./nav/GooeyDesktopNav";
import { MobileNav } from "./nav/MobileNav";
import { InvitationCTA } from "./nav/InvitationCTA";
import type { SiteScreen } from "./siteNavigation";

const useGooeyNav = import.meta.env.VITE_ENABLE_GOOEY_NAV === 'true';

const lumeLogoImage = mediaUrl("LUMElogo.png");

function routeToSiteScreen(section: string): SiteScreen {
  return section === "products" ||
    section === "vehicles" ||
    section === "showcase" ||
    section === "contact"
    ? section
    : "home";
}

function getNavSound(screen: SiteScreen) {
  switch (screen) {
    case "home":
      return "nav.toHome";
    case "products":
      return "nav.toProducts";
    case "vehicles":
      return "nav.toVehicles";
    case "showcase":
      return "nav.toShowcase";
    case "contact":
      return "nav.toContact";
  }
}

export function SiteHeader() {
  const { config } = useCurrentRoute();
  const { navigateTo } = useNavigation();
  const currentScreen = routeToSiteScreen(config.section);
  const onNavigate = (screen: SiteScreen) =>
    navigateTo(
      { route: screen },
      { sound: getNavSound(screen), analytics: { action: "header" } }
    );

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between
        px-6 md:px-10 h-16 md:h-[72px]
        bg-black/70 backdrop-blur-md border-b border-white/5 overflow-hidden"
    >
      {/* Logo */}
      <button
        aria-label="Go to LUME home"
        onClick={() => onNavigate("home")}
        className="flex-shrink-0 cursor-pointer focus-visible:outline-none
          focus-visible:ring-1 focus-visible:ring-[#C9A84C] rounded"
      >
        <img
          src={lumeLogoImage}
          alt="LUME"
          className="h-8 md:h-9 w-auto object-contain"
          draggable={false}
        />
      </button>

      {/* Desktop nav — centered */}
      <div className="hidden md:flex absolute left-1/2 -translate-x-1/2">
        {useGooeyNav
          ? <GooeyDesktopNav currentScreen={currentScreen} onNavigate={onNavigate} />
          : <DesktopNav currentScreen={currentScreen} onNavigate={onNavigate} />}
      </div>

      {/* Right slot */}
      <div className="flex items-center gap-4">
        <InvitationCTA
          onClick={() => onNavigate("contact")}
          className="hidden md:inline-flex"
        />
        <MobileNav currentScreen={currentScreen} onNavigate={onNavigate} />
      </div>
    </header>
  );
}
