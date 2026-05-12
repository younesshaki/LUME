import type { ActionKey } from "@/lib/sound";
import type { SiteScreen } from "../siteNavigation";

export function getHeaderNavigationSound(screen: SiteScreen): ActionKey {
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
