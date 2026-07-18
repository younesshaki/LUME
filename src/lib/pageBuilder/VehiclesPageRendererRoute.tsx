import { SiteFooter } from "@/components/layout/SiteFooter";
import VehiclesPage from "@/experience/ui/VehiclesPage";
import { PageRenderer } from "./PageRenderer";

type VehiclesPageRendererRouteProps = {
  onGoHome: () => void;
  onNavigateToProducts: () => void;
  onNavigateToShowcase: () => void;
  onNavigateToContact: () => void;
  onSelectVehicle: (vehicleId: string) => void;
};

/**
 * Keep the public inventory on its own route chunk. The generic page-renderer
 * entry imports every built-in cinematic route, which makes an inventory visit
 * fetch code for pages it cannot render. This focused adapter preserves the
 * published-page capability while making the marketplace's critical module
 * graph independent from Home, Products, and Showcase.
 */
export default function VehiclesPageRendererRoute({
  onGoHome,
  onNavigateToProducts,
  onNavigateToShowcase,
  onNavigateToContact,
  onSelectVehicle,
}: VehiclesPageRendererRouteProps) {
  const fallback = (
    <VehiclesPage
      onGoHome={onGoHome}
      onNavigateToProducts={onNavigateToProducts}
      onNavigateToShowcase={onNavigateToShowcase}
      onNavigateToContact={onNavigateToContact}
      onSelectVehicle={onSelectVehicle}
    />
  );

  return (
    <PageRenderer
      slug="vehicles"
      fallback={fallback}
      // A page-builder lookup is allowed to enhance the vehicle route, never
      // to delay its inventory cards. A published block document replaces this
      // functional fallback once it is available.
      loadingFallback={fallback}
      context={{ onSelectVehicle }}
      footer={
        <SiteFooter
          onNavigate={(screen) => {
            if (screen === "home") onGoHome();
            else if (screen === "products") onNavigateToProducts();
            else if (screen === "showcase") onNavigateToShowcase();
            else if (screen === "contact") onNavigateToContact();
          }}
        />
      }
    />
  );
}
