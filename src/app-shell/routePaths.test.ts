import { describe, expect, it } from "vitest";
import {
  matchRoutePath,
  pathToRouteId,
  resolvePath,
  ROUTE_PATHS,
  screenToPath,
} from "./routePaths";

describe("routePaths", () => {
  it("defines the public route paths used by the routing migration plan", () => {
    expect(ROUTE_PATHS.home).toBe("/home");
    expect(ROUTE_PATHS.products).toBe("/products");
    expect(ROUTE_PATHS.productDetail).toBe("/products/:productId");
    expect(ROUTE_PATHS.vehicles).toBe("/vehicles");
    expect(ROUTE_PATHS.vehicleDetail).toBe("/vehicles/:vehicleId");
    expect(ROUTE_PATHS.showcaseExperience).toBe("/showcase/experience");
    expect(ROUTE_PATHS.contact).toBe("/contact");
    expect(ROUTE_PATHS.admin).toBe("/admin");
    expect(ROUTE_PATHS.adminDashboard).toBe("/admin/dashboard");
  });

  it("resolves parameterized product and vehicle paths safely", () => {
    expect(resolvePath({ route: "productDetail", productId: "red-bull" })).toBe(
      "/products/red-bull"
    );
    expect(resolvePath({ route: "vehicleDetail", vehicleId: "bmw m3" })).toBe(
      "/vehicles/bmw%20m3"
    );
  });

  it("resolves showcase experience query parameters without requiring both values", () => {
    expect(resolvePath({ route: "showcaseExperience" })).toBe(
      "/showcase/experience"
    );
    expect(resolvePath({ route: "showcaseExperience", part: 0 })).toBe(
      "/showcase/experience?part=0"
    );
    expect(resolvePath({ route: "showcaseExperience", part: 1, chapter: 2 })).toBe(
      "/showcase/experience?part=1&chapter=2"
    );
  });

  it("maps legacy screen names to route paths during the migration window", () => {
    expect(screenToPath("titlecard")).toBe("/showcase/intro");
    expect(screenToPath("titlecard", { partIndex: 1, chapterIndex: 2 })).toBe(
      "/showcase/intro?part=1&chapter=2"
    );
    expect(screenToPath("experience", { partIndex: 1, chapterIndex: 2 })).toBe(
      "/showcase/experience?part=1&chapter=2"
    );
    expect(screenToPath("productDetail", { productId: "red-bull" })).toBe(
      "/products/red-bull"
    );
  });

  it("matches browser paths back to route ids and params", () => {
    expect(pathToRouteId("/vehicles")).toBe("vehicles");
    expect(pathToRouteId("/showcase/experience?part=1")).toBe(
      "showcaseExperience"
    );
    expect(pathToRouteId("/admin")).toBe("admin");
    expect(pathToRouteId("/admin/dashboard")).toBe("adminDashboard");
    expect(matchRoutePath("/products/red-bull")).toEqual({
      routeId: "productDetail",
      params: { productId: "red-bull" },
    });
    expect(matchRoutePath("/vehicles/bmw%20m3")).toEqual({
      routeId: "vehicleDetail",
      params: { vehicleId: "bmw m3" },
    });
  });
});
