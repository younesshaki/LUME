import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useNavigation } from "@/app-shell/NavigationProvider";
import { mediaUrl } from "@/config/cdn";
import { loadHeaderConfig, type PublicHeaderConfig } from "@/lib/publicNav";
import { play } from "@/lib/sound";
import { DesktopNav } from "../nav/DesktopNav";
import { GooeyDesktopNav } from "../nav/GooeyDesktopNav";
import { MobileNav } from "../nav/MobileNav";
import { InvitationCTA } from "../nav/InvitationCTA";
import { isSiteScreen, useSiteNavItems, type SiteNavItem } from "../siteNavigation";
import { useSiteHeaderLayoutState } from "./SiteHeader.animations";
import { getHeaderNavigationSound } from "./SiteHeader.sounds";
import { useSiteHeaderState } from "./SiteHeader.state";

const useGooeyNav = import.meta.env.VITE_ENABLE_GOOEY_NAV === 'true';

const lumeLogoImage = mediaUrl("LUMElogo.png");

/**
 * Which nav item is active. Cinematic screens come from the route section;
 * custom published pages are matched from the /:pageSlug pathname.
 */
function deriveActiveNavKey(
  currentPath: string,
  currentScreen: string,
  items: SiteNavItem[]
): string {
  const slug = currentPath.replace(/^\/+|\/+$/g, "");
  if (slug && !isSiteScreen(slug) && items.some((item) => item.screen === slug)) {
    return slug;
  }
  return currentScreen;
}

function useHeaderConfig(): PublicHeaderConfig {
  const [config, setConfig] = useState<PublicHeaderConfig>({
    showCta: true,
    ctaLabel: "Request Invitation",
  });
  useEffect(() => {
    let cancelled = false;
    void loadHeaderConfig().then((loaded) => {
      if (!cancelled) setConfig(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return config;
}

export function SiteHeader() {
  const { navigateTo, currentPath } = useNavigation();
  const routerNavigate = useNavigate();
  const { currentScreen } = useSiteHeaderState();
  const { hasOverlayPressure } = useSiteHeaderLayoutState();
  const items = useSiteNavItems();
  const headerConfig = useHeaderConfig();

  const activeKey = deriveActiveNavKey(currentPath, currentScreen, items);

  const onNavigate = (key: string) => {
    if (isSiteScreen(key)) {
      navigateTo(
        { route: key },
        { sound: getHeaderNavigationSound(key), analytics: { action: "header" } }
      );
      return;
    }
    // Custom published page: plain route change to /<slug>.
    play("nav.toHome");
    routerNavigate(`/${key}`);
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between
        px-6 md:px-10 h-16 md:h-[72px]
        bg-black/70 backdrop-blur-md border-b border-white/5 overflow-hidden
        transition-colors duration-200 ${hasOverlayPressure ? "border-white/10 bg-black/80" : ""}`}
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
          ? <GooeyDesktopNav currentScreen={activeKey} onNavigate={onNavigate} items={items} />
          : <DesktopNav currentScreen={activeKey} onNavigate={onNavigate} items={items} />}
      </div>

      {/* Right slot */}
      <div className="flex items-center gap-4">
        {headerConfig.showCta && (
          <InvitationCTA
            onClick={() => onNavigate("contact")}
            label={headerConfig.ctaLabel}
            className="hidden md:inline-flex"
          />
        )}
        <MobileNav
          currentScreen={activeKey}
          onNavigate={onNavigate}
          items={items}
          showCta={headerConfig.showCta}
          ctaLabel={headerConfig.ctaLabel}
        />
      </div>
    </header>
  );
}
