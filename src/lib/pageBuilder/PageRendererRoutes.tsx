import ContactPage from "@/experience/ui/ContactPage";
import ProductsPage from "@/experience/ui/ProductsPage";
import ShowcasePage from "@/experience/ui/ShowcasePage";
import StoryHomePage from "@/experience/ui/StoryHomePage";
import VehiclesPage from "@/experience/ui/VehiclesPage";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { PageRenderer } from "./PageRenderer";

type HomePageRendererRouteProps = {
  onEnter: (partIndex: number, chapterIndex: number) => void;
  onNavigateToProducts: () => void;
  onNavigateToVehicles: () => void;
  onNavigateToShowcase: () => void;
  onNavigateToContact: () => void;
};

type ProductsPageRendererRouteProps = {
  onGoHome: () => void;
  onSelectProduct: (productId: string) => void;
  onNavigateToVehicles: () => void;
  onNavigateToShowcase: () => void;
  onNavigateToContact: () => void;
};

type VehiclesPageRendererRouteProps = {
  onGoHome: () => void;
  onNavigateToProducts: () => void;
  onNavigateToShowcase: () => void;
  onNavigateToContact: () => void;
  onSelectVehicle: (vehicleId: string) => void;
};

type ShowcasePageRendererRouteProps = {
  onGoHome: () => void;
  onNavigateToProducts: () => void;
  onNavigateToVehicles: () => void;
  onNavigateToContact: () => void;
  onEnter: (partIndex: number, chapterIndex: number) => void;
};

type ContactPageRendererRouteProps = {
  onGoHome: () => void;
  onNavigateToProducts: () => void;
  onNavigateToVehicles: () => void;
  onNavigateToShowcase: () => void;
};

export function HomePageRendererRoute({
  onEnter,
  onNavigateToProducts,
  onNavigateToVehicles,
  onNavigateToShowcase,
  onNavigateToContact,
}: HomePageRendererRouteProps) {
  const fallback = (
    <StoryHomePage
      onEnter={onEnter}
      onNavigateToProducts={onNavigateToProducts}
      onNavigateToVehicles={onNavigateToVehicles}
      onNavigateToShowcase={onNavigateToShowcase}
      onNavigateToContact={onNavigateToContact}
    />
  );

  return (
    <PageRenderer
      slug="home"
      fallback={fallback}
      context={{ onEnterShowcase: onEnter }}
      footer={
        <SiteFooter
          onNavigate={(screen) => {
            if (screen === "products") onNavigateToProducts();
            else if (screen === "vehicles") onNavigateToVehicles();
            else if (screen === "showcase") onNavigateToShowcase();
            else if (screen === "contact") onNavigateToContact();
            else if (screen === "home") {
              document.querySelector(".storyHome")?.scrollTo({ top: 0, behavior: "smooth" });
            }
          }}
        />
      }
    />
  );
}

export function ProductsPageRendererRoute({
  onGoHome,
  onSelectProduct,
  onNavigateToVehicles,
  onNavigateToShowcase,
  onNavigateToContact,
}: ProductsPageRendererRouteProps) {
  const fallback = (
    <ProductsPage
      onGoHome={onGoHome}
      onSelectProduct={onSelectProduct}
      onNavigateToVehicles={onNavigateToVehicles}
      onNavigateToShowcase={onNavigateToShowcase}
      onNavigateToContact={onNavigateToContact}
    />
  );

  return (
    <PageRenderer
      slug="products"
      fallback={fallback}
      context={{ onSelectProduct }}
      footer={
        <SiteFooter
          onNavigate={(screen) => {
            if (screen === "home") onGoHome();
            else if (screen === "vehicles") onNavigateToVehicles();
            else if (screen === "showcase") onNavigateToShowcase();
            else if (screen === "contact") onNavigateToContact();
          }}
        />
      }
    />
  );
}

export function VehiclesPageRendererRoute({
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

export function ShowcasePageRendererRoute({
  onGoHome,
  onNavigateToProducts,
  onNavigateToVehicles,
  onNavigateToContact,
  onEnter,
}: ShowcasePageRendererRouteProps) {
  const fallback = (
    <ShowcasePage
      onGoHome={onGoHome}
      onNavigateToProducts={onNavigateToProducts}
      onNavigateToVehicles={onNavigateToVehicles}
      onNavigateToContact={onNavigateToContact}
      onEnter={onEnter}
    />
  );

  return (
    <PageRenderer
      slug="showcase"
      fallback={fallback}
      context={{ onEnterShowcase: onEnter }}
      footer={
        <SiteFooter
          onNavigate={(screen) => {
            if (screen === "home") onGoHome();
            else if (screen === "products") onNavigateToProducts();
            else if (screen === "vehicles") onNavigateToVehicles();
            else if (screen === "contact") onNavigateToContact();
          }}
        />
      }
    />
  );
}

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
