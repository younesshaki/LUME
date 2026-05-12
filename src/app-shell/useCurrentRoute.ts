import { useLocation } from "react-router-dom";
import type { AppRouteId } from "./routeIds";
import { getRouteConfig } from "./routeConfig";
import { matchRoutePath } from "./routePaths";

export function useCurrentRoute() {
  const location = useLocation();
  const match = matchRoutePath(location.pathname);
  const routeId: AppRouteId = match?.routeId ?? "home";

  return {
    routeId,
    params: match?.params ?? {},
    config: getRouteConfig(routeId),
  };
}

