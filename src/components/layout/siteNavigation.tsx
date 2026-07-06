import { CarFront, FileText, House, Mail, Package, Sparkles } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { loadPublishedNav, isScreenSlug } from "@/lib/publicNav";

export type SiteScreen = "home" | "products" | "vehicles" | "showcase" | "contact";

/**
 * A header nav entry. `screen` doubles as the nav key: for the five
 * cinematic screens it IS the SiteScreen; for custom published pages it is
 * the page slug (routed to /<slug> by the header's navigate handler).
 */
export type SiteNavItem = {
  label: string;
  screen: SiteScreen | (string & {});
  icon: React.ReactNode;
};

const SCREEN_ICONS: Record<SiteScreen, React.ReactNode> = {
  home: <House size={18} strokeWidth={1.9} />,
  products: <Package size={18} strokeWidth={1.9} />,
  vehicles: <CarFront size={18} strokeWidth={1.9} />,
  showcase: <Sparkles size={18} strokeWidth={1.9} />,
  contact: <Mail size={18} strokeWidth={1.9} />,
};

const customPageIcon = <FileText size={18} strokeWidth={1.9} />;

/**
 * Hardcoded fallback — used until (or unless) the tenant's published nav
 * loads. Typed to the five screens so screen-only consumers (footer, dock)
 * keep their exhaustive SiteScreen handling.
 */
export const SITE_NAV_ITEMS: Array<SiteNavItem & { screen: SiteScreen }> = [
  { label: "Home", screen: "home", icon: SCREEN_ICONS.home },
  { label: "Products", screen: "products", icon: SCREEN_ICONS.products },
  { label: "Vehicles", screen: "vehicles", icon: SCREEN_ICONS.vehicles },
  { label: "Showcase", screen: "showcase", icon: SCREEN_ICONS.showcase },
  { label: "Contact", screen: "contact", icon: SCREEN_ICONS.contact },
];

export function isSiteScreen(key: string): key is SiteScreen {
  return isScreenSlug(key);
}

/**
 * The tenant's real header nav: published pages in nav order (custom pages
 * included), capped by the admin Navigation settings. Falls back to the
 * hardcoded items while loading or if the lookup fails.
 */
export function useSiteNavItems(): SiteNavItem[] {
  const [items, setItems] = useState<SiteNavItem[]>(SITE_NAV_ITEMS);

  useEffect(() => {
    let cancelled = false;
    void loadPublishedNav().then((pages) => {
      if (cancelled || !pages) return;
      setItems(
        pages.map((page) => ({
          label: page.title || page.slug,
          screen: page.slug,
          icon: isSiteScreen(page.slug) ? SCREEN_ICONS[page.slug] : customPageIcon,
        }))
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return items;
}
