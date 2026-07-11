export type PublicRouteId =
  | "gate"
  | "home"
  | "products"
  | "productDetail"
  | "vehicles"
  | "vehicleDetail"
  | "showcase"
  | "showcaseIntro"
  | "showcaseExperience"
  | "contact"
  | "account";

export type AdminRouteId = "admin" | "adminLogin" | "adminDashboard";

export type AppRouteId = PublicRouteId | AdminRouteId;

export type PublicSection =
  | "gate"
  | "home"
  | "products"
  | "vehicles"
  | "showcase"
  | "contact"
  | "account";

export type AppSection = PublicSection | "admin";

export const PUBLIC_ROUTE_IDS = [
  "gate",
  "home",
  "products",
  "productDetail",
  "vehicles",
  "vehicleDetail",
  "showcase",
  "showcaseIntro",
  "showcaseExperience",
  "contact",
  "account",
] as const satisfies readonly PublicRouteId[];

export const ADMIN_ROUTE_IDS = [
  "admin",
  "adminLogin",
  "adminDashboard",
] as const satisfies readonly AdminRouteId[];
