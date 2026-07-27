import { SiteFooter } from "@/components/layout/SiteFooter";
import VehicleDetailPage from "@/experience/ui/VehicleDetailPage";
import { PageRenderer } from "./PageRenderer";

type VehicleDetailPageRendererRouteProps = {
  vehicleId: string | null;
  onBackToVehicles: () => void;
  onGoHome: () => void;
  onNavigateToProducts: () => void;
  onNavigateToShowcase: () => void;
  onNavigateToContact: () => void;
};

/**
 * Page-builder-capable vehicle detail route. The hardcoded VehicleDetailPage
 * stays the always-available fallback — identical to before for any tenant
 * without a published "vehicle" page document — while a published
 * page-builder document (a `vehicle-detail` block plus anything the dealer
 * arranges around it) replaces it. Mirrors VehiclesPageRendererRoute.
 */
export default function VehicleDetailPageRendererRoute({
  vehicleId,
  onBackToVehicles,
  onGoHome,
  onNavigateToProducts,
  onNavigateToShowcase,
  onNavigateToContact,
}: VehicleDetailPageRendererRouteProps) {
  const fallback = (
    <VehicleDetailPage
      vehicleId={vehicleId}
      onBackToVehicles={onBackToVehicles}
      onGoHome={onGoHome}
      onNavigateToProducts={onNavigateToProducts}
      onNavigateToShowcase={onNavigateToShowcase}
      onNavigateToContact={onNavigateToContact}
    />
  );

  return (
    <PageRenderer
      slug="vehicle"
      fallback={fallback}
      // A page-builder lookup is allowed to enhance the vehicle route, never
      // to delay its detail content. A published block document replaces this
      // functional fallback once it is available.
      loadingFallback={fallback}
      footer={
        <SiteFooter
          onNavigate={(screen) => {
            if (screen === "home") onGoHome();
            else if (screen === "products") onNavigateToProducts();
            else if (screen === "vehicles") onBackToVehicles();
            else if (screen === "showcase") onNavigateToShowcase();
            else if (screen === "contact") onNavigateToContact();
          }}
        />
      }
    />
  );
}
