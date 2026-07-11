import type { AppRouteId } from "./routeIds";

// One central map for every URL the app understands. Keeping paths here avoids
// hardcoding strings like "/vehicles" in many components as the project grows.
export const ROUTE_PATHS = {
  gate: "/",
  home: "/home",
  products: "/products",
  productDetail: "/products/:productId",
  vehicles: "/vehicles",
  vehicleDetail: "/vehicles/:vehicleId",
  showcase: "/showcase",
  showcaseIntro: "/showcase/intro",
  showcaseExperience: "/showcase/experience",
  contact: "/contact",
  account: "/account",
  admin: "/admin",
  adminLogin: "/admin/login",
  adminDashboard: "/admin/dashboard",
} as const satisfies Record<AppRouteId, string>;

type StaticRouteId = Exclude<
  AppRouteId,
  "productDetail" | "vehicleDetail" | "showcaseExperience"
>;

export type AppRouteLocation =
  | { route: StaticRouteId }
  | { route: "productDetail"; productId: string }
  | { route: "vehicleDetail"; vehicleId: string }
  | { route: "showcaseExperience"; part?: number; chapter?: number };

export type LegacyAppScreen =
  | "gate"
  | "home"
  | "products"
  | "productDetail"
  | "vehicles"
  | "vehicleDetail"
  | "showcase"
  | "contact"
  | "account"
  | "titlecard"
  | "experience"
  | "admin";

export type ScreenPathParams = {
  productId?: string;
  vehicleId?: string;
  part?: number;
  chapter?: number;
  partIndex?: number;
  chapterIndex?: number;
};

export type RoutePathMatch = {
  routeId: AppRouteId;
  params: Record<string, string>;
};

// More specific routes must be checked first. For example, "/products/red-bull"
// should match productDetail before the broader "/products" route.
const ROUTE_MATCH_ORDER: AppRouteId[] = [
  "adminLogin",
  "adminDashboard",
  "productDetail",
  "vehicleDetail",
  "showcaseExperience",
  "showcaseIntro",
  "products",
  "vehicles",
  "showcase",
  "contact",
  "account",
  "home",
  "admin",
  "gate",
];

export function resolvePath(location: AppRouteLocation): string {
  switch (location.route) {
    case "productDetail":
      // Dynamic route example: the product id becomes part of the URL.
      return `/products/${encodePathSegment(location.productId)}`;
    case "vehicleDetail":
      return `/vehicles/${encodePathSegment(location.vehicleId)}`;
    case "showcaseExperience":
      // Showcase entry state is optional, so it lives in query params instead
      // of forcing many different hardcoded paths.
      return withSearch(ROUTE_PATHS.showcaseExperience, {
        part: location.part,
        chapter: location.chapter,
      });
    default:
      return ROUTE_PATHS[location.route];
  }
}

export function screenToPath(
  screen: LegacyAppScreen,
  params: ScreenPathParams = {}
): string {
  // Temporary migration bridge: App.tsx still thinks in old "screen" names,
  // but the browser needs real URL paths. This lets both systems coexist.
  switch (screen) {
    case "productDetail":
      return resolvePath({
        route: "productDetail",
        productId: requireParam(params.productId, "productId"),
      });
    case "vehicleDetail":
      return resolvePath({
        route: "vehicleDetail",
        vehicleId: requireParam(params.vehicleId, "vehicleId"),
      });
    case "titlecard":
      return withSearch(ROUTE_PATHS.showcaseIntro, {
        part: params.part ?? params.partIndex,
        chapter: params.chapter ?? params.chapterIndex,
      });
    case "experience":
      return resolvePath({
        route: "showcaseExperience",
        part: params.part ?? params.partIndex,
        chapter: params.chapter ?? params.chapterIndex,
      });
    default:
      return resolvePath({ route: screen });
  }
}

export function pathToRouteId(pathname: string): AppRouteId | null {
  return matchRoutePath(pathname)?.routeId ?? null;
}

export function matchRoutePath(pathname: string): RoutePathMatch | null {
  const normalizedPathname = normalizePathname(pathname);

  // We manually match paths here so non-component code can understand URLs
  // without needing React Router hooks.
  for (const routeId of ROUTE_MATCH_ORDER) {
    const match = matchPathPattern(ROUTE_PATHS[routeId], normalizedPathname);

    if (match) {
      return { routeId, params: match };
    }
  }

  return null;
}

function encodePathSegment(value: string): string {
  if (!value) {
    throw new Error("Route path segment cannot be empty.");
  }

  return encodeURIComponent(value);
}

function requireParam(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing route parameter: ${name}.`);
  }

  return value;
}

function withSearch(
  pathname: string,
  params: Record<string, string | number | undefined>
): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }

  const query = search.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function normalizePathname(pathname: string): string {
  const [withoutSearch] = pathname.split(/[?#]/);
  const cleanPathname = withoutSearch || "/";

  if (cleanPathname === "/") {
    return cleanPathname;
  }

  return cleanPathname.replace(/\/+$/, "");
}

function matchPathPattern(
  pattern: string,
  pathname: string
): Record<string, string> | null {
  // Turns a pattern like "/products/:productId" into a match result like
  // { productId: "red-bull" } when the user visits "/products/red-bull".
  const patternSegments = normalizePathname(pattern).split("/").filter(Boolean);
  const pathnameSegments = normalizePathname(pathname).split("/").filter(Boolean);

  if (patternSegments.length !== pathnameSegments.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let index = 0; index < patternSegments.length; index += 1) {
    const patternSegment = patternSegments[index];
    const pathnameSegment = pathnameSegments[index];

    if (patternSegment.startsWith(":")) {
      params[patternSegment.slice(1)] = decodeURIComponent(pathnameSegment);
      continue;
    }

    if (patternSegment !== pathnameSegment) {
      return null;
    }
  }

  return params;
}
