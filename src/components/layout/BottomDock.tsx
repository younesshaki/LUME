import Dock from "@/components/Dock";
import { useCurrentRoute } from "@/app-shell/useCurrentRoute";
import { useNavigation } from "@/app-shell/NavigationProvider";
import { SITE_NAV_ITEMS, type SiteScreen } from "./siteNavigation";
import "./BottomDock.css";

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

export function BottomDock() {
  const { config } = useCurrentRoute();
  const { navigateTo } = useNavigation();
  const currentScreen = routeToSiteScreen(config.section);

  return (
    <div className="siteDock" aria-label="Primary navigation dock">
      <Dock
        items={SITE_NAV_ITEMS.map((item) => ({
          icon: item.icon,
          label: item.label,
          onClick: () =>
            navigateTo(
              { route: item.screen },
              { sound: getNavSound(item.screen), analytics: { action: "dock" } }
            ),
          className:
            currentScreen === item.screen ? "siteDock__item siteDock__item--active" : "siteDock__item",
        }))}
        panelHeight={68}
        baseItemSize={50}
        magnification={70}
        dockHeight={156}
        containerClassName="siteDock__container"
        className="siteDock__panel"
      />
    </div>
  );
}
