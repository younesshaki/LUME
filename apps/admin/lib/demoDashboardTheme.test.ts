import { describe, expect, it } from "vitest";
import {
  demoDashboardThemeStorageKey,
  shouldInitializeDemoDashboardLightMode,
} from "./demoDashboardTheme";

describe("demo dashboard light-mode default", () => {
  it.each(["demo-sean", "demo-arash", "demo-max"])(
    "initializes %s once",
    (tenantSlug) => {
      expect(shouldInitializeDemoDashboardLightMode(tenantSlug, false)).toBe(true);
      expect(shouldInitializeDemoDashboardLightMode(tenantSlug, true)).toBe(false);
    },
  );

  it("does not alter the dashboard theme for any other tenant", () => {
    expect(shouldInitializeDemoDashboardLightMode("demo", false)).toBe(false);
    expect(shouldInitializeDemoDashboardLightMode("default", false)).toBe(false);
    expect(shouldInitializeDemoDashboardLightMode(undefined, false)).toBe(false);
  });

  it("keeps the initialization marker isolated per tenant", () => {
    expect(demoDashboardThemeStorageKey("demo-sean")).toBe(
      "lume:demo-dashboard-theme-initialized:v1:demo-sean",
    );
    expect(demoDashboardThemeStorageKey("demo-sean")).not.toBe(
      demoDashboardThemeStorageKey("demo-arash"),
    );
  });
});
