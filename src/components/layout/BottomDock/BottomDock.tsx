import Dock from "@/components/Dock";
import { useNavigation } from "@/app-shell/NavigationProvider";
import { preloadRouteModule } from "@/app-shell/routeModules";
import { SITE_NAV_ITEMS } from "../siteNavigation";
import { useBottomDockLayoutState } from "./BottomDock.animations";
import { getBottomDockNavigationSound } from "./BottomDock.sounds";
import { deriveActiveNavKey } from "../nav/activeNav";
import "./BottomDock.css";

export function BottomDock() {
  const { navigateTo, currentPath } = useNavigation();
  // Same rule as the header: an unmatched page marks nothing, not "Home".
  const currentScreen = deriveActiveNavKey(currentPath, SITE_NAV_ITEMS) ?? "";
  const { isCompetingWithOverlay } = useBottomDockLayoutState();

  return (
    <div
      className={`siteDock ${isCompetingWithOverlay ? "siteDock--overlayOpen" : ""}`.trim()}
      aria-label="Primary navigation dock"
    >
      <Dock
        items={SITE_NAV_ITEMS.map((item) => ({
          icon: item.icon,
          label: item.label,
          onClick: () =>
            navigateTo(
              { route: item.screen },
              { sound: getBottomDockNavigationSound(item.screen), analytics: { action: "dock" } }
            ),
          onIntent: () => preloadRouteModule(item.screen),
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
