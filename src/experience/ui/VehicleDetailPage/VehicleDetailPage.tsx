import CinematicShell from "../CinematicShell";
import { SiteFooter } from "@/components/layout/SiteFooter";
import VehicleDetailContent from "./VehicleDetailContent";
import "./VehicleDetailPage.css";

type VehicleDetailPageProps = {
  vehicleId: string | null;
  onBackToVehicles: () => void;
  onGoHome: () => void;
  onNavigateToProducts: () => void;
  onNavigateToShowcase: () => void;
  onNavigateToContact: () => void;
};

/**
 * The hardcoded vehicle detail page — the always-available fallback. All of
 * the actual surface (gallery, specs, actions, inquiry modal, concierge
 * target, tracking) lives in VehicleDetailContent, shared with the
 * page-builder `vehicle-detail` block; this shell only provides the page
 * chrome around it.
 */
export default function VehicleDetailPage({
  vehicleId,
  onBackToVehicles,
  onGoHome,
  onNavigateToProducts,
  onNavigateToShowcase,
  onNavigateToContact,
}: VehicleDetailPageProps) {
  return (
    <CinematicShell>
      <div className="vehicleDetail">
        <main className="vehicleDetail__main" style={{ paddingTop: "72px", paddingBottom: "160px" }}>
          <VehicleDetailContent vehicleId={vehicleId} onBackToVehicles={onBackToVehicles} />
        </main>
        <SiteFooter onNavigate={(s) => {
          if (s === "home") onGoHome();
          else if (s === "products") onNavigateToProducts();
          else if (s === "vehicles") onBackToVehicles();
          else if (s === "showcase") onNavigateToShowcase();
          else if (s === "contact") onNavigateToContact();
        }} />
      </div>
    </CinematicShell>
  );
}
