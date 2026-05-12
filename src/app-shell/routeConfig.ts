import type { AppRouteId, AppSection } from "./routeIds";
import { ROUTE_PATHS } from "./routePaths";

export type ChromeVariant = "immersive" | "public" | "admin";
export type DockVariant =
  | "default"
  | "product"
  | "vehicle"
  | "showcase"
  | "immersive"
  | "hidden"
  | "admin";

export type RouteChromeConfig = {
  variant: ChromeVariant;
  showHeader: boolean;
  showDock: boolean;
  showBackButton: boolean;
  showSettingsButton: boolean;
};

export type RouteConfig = {
  id: AppRouteId;
  path: string;
  label: string;
  section: AppSection;
  chrome: RouteChromeConfig;
  dockVariant: DockVariant;
  backFallback?: AppRouteId;
};

// Route config describes page-level behavior that should not be scattered
// across many components: header, dock, back button, and layout variant.
const publicChrome: RouteChromeConfig = {
  variant: "public",
  showHeader: true,
  showDock: true,
  showBackButton: false,
  showSettingsButton: false,
};

const detailChrome: RouteChromeConfig = {
  ...publicChrome,
  showBackButton: true,
};

const publicBackChrome: RouteChromeConfig = {
  ...publicChrome,
  showBackButton: true,
};

const immersiveChrome: RouteChromeConfig = {
  variant: "immersive",
  showHeader: false,
  showDock: false,
  showBackButton: true,
  showSettingsButton: true,
};

const adminChrome: RouteChromeConfig = {
  variant: "admin",
  showHeader: false,
  showDock: false,
  showBackButton: false,
  showSettingsButton: false,
};

export const ROUTE_CONFIG = {
  gate: {
    id: "gate",
    path: ROUTE_PATHS.gate,
    label: "Gate",
    section: "gate",
    chrome: {
      variant: "immersive",
      showHeader: false,
      showDock: false,
      showBackButton: false,
      showSettingsButton: false,
    },
    dockVariant: "hidden",
  },
  home: {
    id: "home",
    path: ROUTE_PATHS.home,
    label: "Home",
    section: "home",
    chrome: publicChrome,
    dockVariant: "default",
  },
  products: {
    id: "products",
    path: ROUTE_PATHS.products,
    label: "Products",
    section: "products",
    chrome: publicBackChrome,
    dockVariant: "default",
    backFallback: "home",
  },
  productDetail: {
    id: "productDetail",
    path: ROUTE_PATHS.productDetail,
    label: "Product Detail",
    section: "products",
    chrome: detailChrome,
    dockVariant: "product",
    backFallback: "products",
  },
  vehicles: {
    id: "vehicles",
    path: ROUTE_PATHS.vehicles,
    label: "Vehicles",
    section: "vehicles",
    chrome: publicBackChrome,
    dockVariant: "default",
    backFallback: "home",
  },
  vehicleDetail: {
    id: "vehicleDetail",
    path: ROUTE_PATHS.vehicleDetail,
    label: "Vehicle Detail",
    section: "vehicles",
    chrome: detailChrome,
    dockVariant: "vehicle",
    backFallback: "vehicles",
  },
  showcase: {
    id: "showcase",
    path: ROUTE_PATHS.showcase,
    label: "Showcase",
    section: "showcase",
    chrome: publicBackChrome,
    dockVariant: "showcase",
    backFallback: "home",
  },
  showcaseIntro: {
    id: "showcaseIntro",
    path: ROUTE_PATHS.showcaseIntro,
    label: "Showcase Intro",
    section: "showcase",
    chrome: immersiveChrome,
    dockVariant: "hidden",
    backFallback: "showcase",
  },
  showcaseExperience: {
    id: "showcaseExperience",
    path: ROUTE_PATHS.showcaseExperience,
    label: "Showcase Experience",
    section: "showcase",
    chrome: immersiveChrome,
    dockVariant: "hidden",
    backFallback: "home",
  },
  contact: {
    id: "contact",
    path: ROUTE_PATHS.contact,
    label: "Contact",
    section: "contact",
    chrome: publicBackChrome,
    dockVariant: "default",
    backFallback: "home",
  },
  admin: {
    id: "admin",
    path: ROUTE_PATHS.admin,
    label: "Admin",
    section: "admin",
    chrome: adminChrome,
    dockVariant: "admin",
    backFallback: "home",
  },
  adminLogin: {
    id: "adminLogin",
    path: ROUTE_PATHS.adminLogin,
    label: "Admin Login",
    section: "admin",
    chrome: adminChrome,
    dockVariant: "admin",
    backFallback: "home",
  },
  adminDashboard: {
    id: "adminDashboard",
    path: ROUTE_PATHS.adminDashboard,
    label: "Admin Dashboard",
    section: "admin",
    chrome: adminChrome,
    dockVariant: "admin",
    backFallback: "home",
  },
} as const satisfies Record<AppRouteId, RouteConfig>;

export function getRouteConfig(routeId: AppRouteId): RouteConfig {
  return ROUTE_CONFIG[routeId];
}
