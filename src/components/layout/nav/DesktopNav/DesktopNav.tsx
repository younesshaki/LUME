import { NavLink } from "../NavLink";
import { SITE_NAV_ITEMS, type SiteNavItem } from "../../siteNavigation";

type DesktopNavProps = {
  currentScreen: string;
  onNavigate: (screen: string) => void;
  items?: SiteNavItem[];
};

export function DesktopNav({ currentScreen, onNavigate, items = SITE_NAV_ITEMS }: DesktopNavProps) {
  return (
    <nav aria-label="Main navigation" className="hidden md:flex items-center gap-8">
      {items.map((item) => (
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
