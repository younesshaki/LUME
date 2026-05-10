import { SiteFooter } from "./SiteFooter";
import type { SiteScreen } from "./siteNavigation";

type AppScreen = SiteScreen | "productDetail" | "vehicleDetail";

type SiteLayoutProps = {
  children: React.ReactNode;
  showFooter?: boolean;
  onNavigate: (screen: AppScreen) => void;
};

// Thin wrapper: just appends the footer below page content.
// The global SiteHeader is rendered in App.tsx as a fixed overlay.
export function SiteLayout({ children, showFooter = true, onNavigate }: SiteLayoutProps) {
  return (
    <>
      {children}
      {showFooter && <SiteFooter onNavigate={onNavigate} />}
    </>
  );
}
