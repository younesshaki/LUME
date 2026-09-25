import { afterEach, describe, expect, it, vi } from "vitest";

const loaded = vi.hoisted(() => ({
  vehiclesPage: 0,
  vehiclesRenderer: 0,
  detailRenderer: 0,
  inventoryPrefetch: 0,
}));

vi.mock("@/experience/ui/VehiclesPage", () => {
  loaded.vehiclesPage += 1;
  return {};
});
vi.mock("@/lib/pageBuilder/VehiclesPageRendererRoute", () => {
  loaded.vehiclesRenderer += 1;
  return {};
});
vi.mock("@/lib/pageBuilder/VehicleDetailPageRendererRoute", () => {
  loaded.detailRenderer += 1;
  return {};
});
vi.mock("@/experience/vehicles/prefetch", () => ({
  prefetchInitialVehicleResults: () => {
    loaded.inventoryPrefetch += 1;
  },
}));

import { preloadConciergeDestinationModules } from "./routeModules";

describe("concierge destination warm-up", () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  afterEach(() => fetchSpy.mockClear());

  it("loads the inventory and vehicle-detail route code", async () => {
    preloadConciergeDestinationModules();
    await vi.waitFor(() => {
      expect(loaded.vehiclesPage + loaded.vehiclesRenderer).toBe(1);
      expect(loaded.detailRenderer).toBe(1);
    });
  });

  it("never requests inventory data", async () => {
    // A bot navigation fetches its results only after the destination has
    // applied the concierge's filter. Warming the code must not pre-empt that.
    preloadConciergeDestinationModules();
    await new Promise((resolveTick) => setTimeout(resolveTick, 20));
    expect(loaded.inventoryPrefetch).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
