import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useNavigation } from "@/app-shell/NavigationProvider";
import { preloadRouteModule } from "@/app-shell/routeModules";
import { mediaUrl } from "@/config/cdn";
import { loadHeaderConfig, type PublicHeaderConfig } from "@/lib/publicNav";
import type { TenantHeaderVariant } from "@lume/types";
import { useTenantTheme } from "@/lib/TenantThemeProvider";
import { play } from "@/lib/sound";
import { DesktopNav } from "../nav/DesktopNav";
import { GooeyDesktopNav } from "../nav/GooeyDesktopNav";
import { MobileNav } from "../nav/MobileNav";
import { InvitationCTA } from "../nav/InvitationCTA";
import { ThemeToggle } from "../ThemeToggle";
import { VisitorAccountButton } from "../VisitorAccountButton";
import { isSiteScreen, useSiteNavItems, type SiteNavItem } from "../siteNavigation";
import { useSiteHeaderLayoutState } from "./SiteHeader.animations";
import { getHeaderNavigationSound } from "./SiteHeader.sounds";
import { useSiteHeaderState } from "./SiteHeader.state";
import "./SiteHeader.css";

const useGooeyNav = import.meta.env.VITE_ENABLE_GOOEY_NAV === 'true';

const lumeLogoImage = mediaUrl("LUMElogo.png");

/**
 * Grid tracks per header variant. Every one is a three-track grid, so the
 * overlap fix from Phase 1 holds for all of them — a variant changes the track
 * *sizes*, never whether the nav participates in flow.
 *
 * - centred: nav takes the flexible middle track (the historical look).
 * - left:    nav sits next to the logo, actions pushed right.
 * - split:   nav and actions share the remaining space evenly.
 * - minimal: nav collapses entirely to the "More" menu via a narrow track.
 */
const HEADER_TRACKS: Record<TenantHeaderVariant, string> = {
  centred: "grid-cols-[auto_1fr_auto]",
  left: "grid-cols-[auto_auto_1fr]",
  split: "grid-cols-[auto_1fr_1fr]",
  minimal: "grid-cols-[auto_minmax(0,4rem)_auto]",
};

const NAV_JUSTIFY: Record<TenantHeaderVariant, string> = {
  centred: "justify-center",
  left: "justify-start",
  split: "justify-center",
  minimal: "justify-end",
};

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
  // Optimistic default matches the historical look, so the header does not
  // reflow once the real config lands.
  const [config, setConfig] = useState<PublicHeaderConfig>({
    showCta: true,
    ctaLabel: "Request Invitation",
    variant: "centred",
    logoPlacement: "left",
    sticky: true,
    showVisitorTab: true,
    ctas: [{ label: "Request Invitation", href: "/contact", style: "primary" }],
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
  const tenantTheme = useTenantTheme();
  const logoImage = tenantTheme.branding?.logoUrl ?? lumeLogoImage;

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
    // Three explicit tracks: logo | nav | actions. The nav used to be
    // absolutely positioned and centre-translated, which took it out of flow —
    // the logo and action cluster reserved no space for it, so additional tabs
    // expanded in both directions and overlapped them. As a grid child the nav
    // is bounded by its siblings and can only ever collapse (see DesktopNav).
    //
    // `overflow-hidden` is deliberately gone: it clipped the overlap instead of
    // preventing it, and it would now also clip the "More" dropdown.
    <header
      data-header-variant={headerConfig.variant}
      className={`siteHeader ${headerConfig.sticky ? "fixed" : "absolute"} top-0 left-0 right-0 z-50
        grid items-center gap-4 ${HEADER_TRACKS[headerConfig.variant]}
        px-6 md:px-10 h-16 md:h-[72px]
        backdrop-blur-md border-b
        transition-colors duration-200 ${hasOverlayPressure ? "siteHeader--overlayPressure" : ""}`}
    >
      {/* Logo */}
      <button
        aria-label="Go to LUME home"
        onClick={() => onNavigate("home")}
        onMouseEnter={() => preloadRouteModule("home")}
        onFocus={() => preloadRouteModule("home")}
        onPointerDown={() => preloadRouteModule("home")}
        className="flex-shrink-0 cursor-pointer focus-visible:outline-none
          focus-visible:ring-1 focus-visible:ring-[#C9A84C] rounded"
      >
        <img
          src={logoImage}
          alt="Site logo"
          className="h-8 md:h-9 w-auto object-contain"
          draggable={false}
        />
      </button>

      {/* Desktop nav — the flexible middle track. min-w-0 lets it shrink below
          its content width so the action cluster is never pushed off-screen. */}
      <div className={`min-w-0 flex ${NAV_JUSTIFY[headerConfig.variant]}`}>
        {useGooeyNav
          ? <GooeyDesktopNav currentScreen={activeKey} onNavigate={onNavigate} onIntent={preloadRouteModule} items={items} />
          : <DesktopNav currentScreen={activeKey} onNavigate={onNavigate} onIntent={preloadRouteModule} items={items} />}
      </div>

      {/* Right slot */}
      <div className="flex items-center justify-end gap-3 md:gap-4">
        {headerConfig.showVisitorTab && <VisitorAccountButton />}
        <ThemeToggle />
        {headerConfig.ctas.map((cta, index) => (
          <InvitationCTA
            key={`${cta.label}-${index}`}
            onClick={() => onNavigate(cta.href.replace(/^\//, "") || "contact")}
            onIntent={() => preloadRouteModule("contact")}
            label={cta.label}
            className="hidden md:inline-flex"
          />
        ))}
        <MobileNav
          currentScreen={activeKey}
          onNavigate={onNavigate}
          onIntent={preloadRouteModule}
          items={items}
          showCta={headerConfig.showCta}
          ctaLabel={headerConfig.ctaLabel}
        />
      </div>
    </header>
  );
}
