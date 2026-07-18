import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { logStoryEvent } from "../lib/eventsService";
import { play } from "../lib/sound";
import { useAuth } from "./AuthProvider";
import { preloadVehiclesRoute } from "./routeModules";
import {
  resolveNavigatePath,
  type NavigateMeta,
  type NavigateOptions,
} from "./navigationAdapter";
import { pathToRouteId, ROUTE_PATHS } from "./routePaths";

type NavigationContextValue = {
  currentPath: string;
  navigateTo: (target: NavigateOptions, meta?: NavigateMeta) => void;
};

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { loading, user } = useAuth();
  const routeEnteredAtRef = useRef(Date.now());

  useEffect(() => {
    routeEnteredAtRef.current = Date.now();
  }, [location.pathname, location.search]);

  const navigateTo = useCallback(
    (target: NavigateOptions, meta?: NavigateMeta) => {
      // This is the one place where route intent becomes a browser navigation.
      // It also keeps optional side effects, like navigation sounds, centralized.
      if (meta?.sound) {
        play(meta.sound);
      }

      const toPath = resolveNavigatePath(target);
      const adminAuthRequired =
        target.route === "admin" || target.route === "adminDashboard";
      const resolvedPath =
        adminAuthRequired && !loading && !user ? ROUTE_PATHS.adminLogin : toPath;

      // Start the public inventory request before route rendering. Bot-driven
      // navigation can carry a pending filter that the destination consumes,
      // so it deliberately waits for the route to resolve that filter first.
      if (target.route === "vehicles" && meta?.source !== "bot") {
        preloadVehiclesRoute();
      }

      navigate(resolvedPath, {
        replace: meta?.replace,
        state: {
          source: meta?.source ?? "user",
          from: adminAuthRequired ? toPath : undefined,
        },
      });

      const fromRoute = meta?.analytics?.fromRoute ?? pathToRouteId(location.pathname);
      const nowMs = Date.now();

      void logStoryEvent({
        type: "navigation_action",
        payload: {
          action:
            meta?.analytics?.action ??
            (meta?.source === "bot" ? "bot_navigate" : "navigate"),
          fromRoute,
          toRoute: target.route,
          source: meta?.source ?? "user",
          fromPath: location.pathname,
          toPath: resolvedPath,
          durationMs: Math.max(0, nowMs - routeEnteredAtRef.current),
          occurredAt: new Date(nowMs).toISOString(),
        },
      });
    },
    [loading, location.pathname, navigate, user]
  );

  return (
    <NavigationContext.Provider
      value={{ currentPath: location.pathname, navigateTo }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation(): NavigationContextValue {
  const value = useContext(NavigationContext);

  if (!value) {
    // This catches setup mistakes early if a component uses navigation outside
    // the provider added in main.tsx.
    throw new Error("useNavigation must be used inside NavigationProvider.");
  }

  return value;
}
