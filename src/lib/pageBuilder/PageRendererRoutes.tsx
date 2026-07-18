import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ROUTE_PATHS } from "@/app-shell/routePaths";
import { isScreenSlug } from "@/lib/publicNav";
import ContactPage from "@/experience/ui/ContactPage";
import ProductsPage from "@/experience/ui/ProductsPage";
import ShowcasePage from "@/experience/ui/ShowcasePage";
import StoryHomePage from "@/experience/ui/StoryHomePage";
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

const CUSTOM_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Public route for tenant-created pages (/:pageSlug). Unlike the five
 * cinematic screens there is no hand-built fallback, so this renders
 * unconditionally (not behind the page-renderer flag); an unknown or
 * unpublished slug falls back to the old catch-all behavior (→ /home).
 */
export function CustomPageRendererRoute() {
  const { pageSlug = "" } = useParams();
  const navigate = useNavigate();
  const slug = pageSlug.toLowerCase();

  if (!CUSTOM_SLUG_PATTERN.test(slug) || isScreenSlug(slug)) {
    return <Navigate to={ROUTE_PATHS.home} replace />;
  }

  return (
    <PageRenderer
      slug={slug}
      force
      fallback={<Navigate to={ROUTE_PATHS.home} replace />}
      footer={<SiteFooter onNavigate={(screen) => navigate(ROUTE_PATHS[screen])} />}
    />
  );
}
