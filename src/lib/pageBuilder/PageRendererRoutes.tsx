import ContactPage from "@/experience/ui/ContactPage";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { PageRenderer } from "./PageRenderer";

type ContactPageRendererRouteProps = {
  onGoHome: () => void;
  onNavigateToProducts: () => void;
  onNavigateToVehicles: () => void;
  onNavigateToShowcase: () => void;
};

export function ContactPageRendererRoute({
  onGoHome,
  onNavigateToProducts,
  onNavigateToVehicles,
  onNavigateToShowcase,
}: ContactPageRendererRouteProps) {
  const fallback = (
    <ContactPage
      onGoHome={onGoHome}
      onNavigateToProducts={onNavigateToProducts}
      onNavigateToVehicles={onNavigateToVehicles}
      onNavigateToShowcase={onNavigateToShowcase}
    />
  );

  return (
    <PageRenderer
      slug="contact"
      fallback={fallback}
      footer={
        <SiteFooter
          onNavigate={(screen) => {
            if (screen === "home") onGoHome();
            else if (screen === "products") onNavigateToProducts();
            else if (screen === "vehicles") onNavigateToVehicles();
            else if (screen === "showcase") onNavigateToShowcase();
          }}
        />
      }
    />
  );
}
