import { useCurrentRoute } from "@/app-shell/useCurrentRoute";
import type { SiteScreen } from "../siteNavigation";

export function routeSectionToSiteScreen(section: string): SiteScreen {
  return section === "products" ||
    section === "vehicles" ||
    section === "showcase" ||
    section === "contact"
    ? section
    : "home";
}

export function useSiteHeaderState() {
  const { config } = useCurrentRoute();

  return {
    currentScreen: routeSectionToSiteScreen(config.section),
  };
}
