import { NavLink } from "./NavLink";
import { SITE_NAV_ITEMS, type SiteScreen } from "../siteNavigation";

type DesktopNavProps = {
  currentScreen: string;
  onNavigate: (screen: SiteScreen) => void;
};

export function DesktopNav({ currentScreen, onNavigate }: DesktopNavProps) {
  return (
    <nav aria-label="Main navigation" className="hidden md:flex items-center gap-8">
      {SITE_NAV_ITEMS.map((item) => (
        <NavLink
          key={item.screen}
          label={item.label}
          active={currentScreen === item.screen}
          onClick={() => onNavigate(item.screen)}
        />
      ))}
    </nav>
  );
}
