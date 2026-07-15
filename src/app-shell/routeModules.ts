import { isPageRendererEnabled } from "@/lib/pageBuilder/featureFlag";

export const loadAdminRouter = () => import("@/admin/AdminRouter");
export const loadAccountPage = () => import("@/experience/ui/AccountPage");
export const loadContactPage = () => import("@/experience/ui/ContactPage");
export const loadExperience = () => import("@/experience/Experience");
export const loadProductDetailPage = () => import("@/experience/ui/ProductDetailPage");
export const loadProductsPage = () => import("@/experience/ui/ProductsPage");
export const loadVehicleDetailPage = () => import("@/experience/ui/VehicleDetailPage");
export const loadVehiclesPage = () => import("@/experience/ui/VehiclesPage");
export const loadShowcasePage = () => import("@/experience/ui/ShowcasePage");
export const loadShowcaseTitleCard = () => import("@/experience/ui/ShowcaseTitleCard");
export const loadStoryHomePage = () => import("@/experience/ui/StoryHomePage");

async function registerPageBuilderBlocks(): Promise<void> {
  const { registerBlocks } = await import("@/lib/pageBuilder/registerBlocks");
  registerBlocks();
}

export async function loadPageRendererRoutes() {
  const [, routes] = await Promise.all([
    registerPageBuilderBlocks(),
    import("@/lib/pageBuilder/PageRendererRoutes"),
  ]);
  return routes;
}

export async function loadPagePreviewBridge() {
  const [, bridge] = await Promise.all([
    registerPageBuilderBlocks(),
    import("@/lib/pageBuilder/PagePreviewBridge"),
  ]);
  return bridge;
}

export type RouteModuleIntent =
  | "home"
  | "products"
  | "vehicles"
  | "showcase"
  | "contact"
  | "account"
  | "page-renderer"
  | "none";

export function routeModuleIntentFor(
  routeKey: string,
  pageRendererEnabled = isPageRendererEnabled,
): RouteModuleIntent {
  if (routeKey === "admin" || routeKey === "experience" || routeKey === "titlecard") {
    return "none";
  }
  if (routeKey === "account") return "account";
  if (["home", "products", "vehicles", "showcase", "contact"].includes(routeKey)) {
    return pageRendererEnabled ? "page-renderer" : routeKey as RouteModuleIntent;
  }
  return "page-renderer";
}

/**
 * Preload only after a concrete interaction signal. Dynamic imports are module
 * cached, so repeated hover/focus/pointer events remain a single request.
 */
export function preloadRouteModule(routeKey: string): void {
  let loader: (() => Promise<unknown>) | undefined;
  switch (routeModuleIntentFor(routeKey)) {
    case "home":
      loader = loadStoryHomePage;
      break;
    case "products":
      loader = loadProductsPage;
      break;
    case "vehicles":
      loader = loadVehiclesPage;
      break;
    case "showcase":
      loader = loadShowcasePage;
      break;
    case "contact":
      loader = loadContactPage;
      break;
    case "account":
      loader = loadAccountPage;
      break;
    case "none":
      return;
    case "page-renderer":
    default:
      // Custom published pages share the page-renderer chunk. The admin and
      // Three.js experience are deliberately never speculative imports.
      loader = loadPageRendererRoutes;
  }
  void loader();
}
