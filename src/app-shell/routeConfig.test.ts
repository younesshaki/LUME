import { describe, expect, it } from "vitest";
import { ADMIN_ROUTE_IDS, PUBLIC_ROUTE_IDS, type AppRouteId } from "./routeIds";
import { getRouteConfig, ROUTE_CONFIG } from "./routeConfig";

describe("routeConfig", () => {
  it("has one config entry for every declared app route", () => {
    const routeIds = [...PUBLIC_ROUTE_IDS, ...ADMIN_ROUTE_IDS];

    expect(Object.keys(ROUTE_CONFIG).sort()).toEqual([...routeIds].sort());
  });

  it("keeps detail routes attached to their parent public sections", () => {
    expect(getRouteConfig("productDetail").section).toBe("products");
    expect(getRouteConfig("productDetail").backFallback).toBe("products");
    expect(getRouteConfig("vehicleDetail").section).toBe("vehicles");
    expect(getRouteConfig("vehicleDetail").backFallback).toBe("vehicles");
  });

  it("keeps public secondary pages compatible with the current back-button behavior", () => {
    for (const routeId of ["products", "vehicles", "showcase", "contact"] as const) {
      const config = getRouteConfig(routeId);

      expect(config.chrome.showBackButton).toBe(true);
      expect(config.backFallback).toBe("home");
    }
  });

  it("keeps immersive routes free of public navigation chrome", () => {
    const immersiveRoutes: AppRouteId[] = [
      "gate",
      "showcaseIntro",
      "showcaseExperience",
    ];

    for (const routeId of immersiveRoutes) {
      const config = getRouteConfig(routeId);

      expect(config.chrome.showHeader).toBe(false);
      expect(config.chrome.showDock).toBe(false);
      expect(config.dockVariant).toBe("hidden");
    }
  });

  it("keeps admin routes out of the public chrome layer", () => {
    for (const routeId of ADMIN_ROUTE_IDS) {
      const config = getRouteConfig(routeId);

      expect(config.chrome.showHeader).toBe(false);
      expect(config.chrome.showDock).toBe(false);
      expect(config.chrome.showBackButton).toBe(false);
      expect(config.dockVariant).toBe("admin");
    }
  });
});
