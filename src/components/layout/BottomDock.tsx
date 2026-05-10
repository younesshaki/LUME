import Dock from "@/components/Dock";
import { SITE_NAV_ITEMS, type SiteScreen } from "./siteNavigation";
import "./BottomDock.css";

type BottomDockProps = {
  currentScreen: SiteScreen;
  onNavigate: (screen: SiteScreen) => void;
};

export function BottomDock({ currentScreen, onNavigate }: BottomDockProps) {
  return (
    <div className="siteDock" aria-label="Primary navigation dock">
      <Dock
        items={SITE_NAV_ITEMS.map((item) => ({
          icon: item.icon,
          label: item.label,
          onClick: () => onNavigate(item.screen),
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
