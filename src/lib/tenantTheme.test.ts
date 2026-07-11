import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyTenantTheme,
  clearTenantThemeCacheForTests,
  loadTenantTheme,
  tenantThemeToCssVariables,
} from "./tenantTheme";

describe("tenant theme", () => {
  beforeEach(() => {
    clearTenantThemeCacheForTests();
    applyTenantTheme({}, document.documentElement);
  });

  it("converts tenant theme values into safe CSS variables", () => {
    expect(
      tenantThemeToCssVariables({
        colors: {
          gold: "#f5c86a",
          ink: "rgb(255 255 255)",
          background: "red; color: blue",
        },
        fonts: {
          experience: '"Test Serif", serif',
        },
        cinematicIntensity: 2,
      })
    ).toEqual({
      "--theme-lume-gold": "#f5c86a",
      "--theme-lume-ink": "rgb(255 255 255)",
      "--theme-experience-font-family": '"Test Serif", serif',
      "--lume-cinematic-intensity": "1.5",
    });
  });

  it("applies theme CSS variables and dock variant to the root element", () => {
    applyTenantTheme(
      {
        colors: { gold: "#f5c86a", dockItemBackground: "#111" },
        dockVariant: "minimal",
        cinematic: { intensity: 0.4 },
      },
      document.documentElement
    );

    expect(document.documentElement.style.getPropertyValue("--theme-lume-gold")).toBe("#f5c86a");
    expect(document.documentElement.style.getPropertyValue("--lume-dock-item-bg")).toBe("#111");
    expect(document.documentElement.style.getPropertyValue("--lume-cinematic-intensity")).toBe(
      "0.4"
    );
    expect(document.documentElement.dataset.lumeDockVariant).toBe("minimal");
  });

  it("falls back to defaults when the theme RPC is unavailable", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "function missing" } }),
    };

    await expect(loadTenantTheme("default", client as never)).resolves.toEqual({});
    expect(client.rpc).toHaveBeenCalledWith("get_tenant_theme", { p_slug: "default" });
  });

  it("keeps the public vehicle price-signal opt-in boolean", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: [{ theme: { vehiclePricing: { showPriceReductionSignal: true } } }],
        error: null,
      }),
    };
    await expect(loadTenantTheme("price-signal", client as never)).resolves.toMatchObject({
      vehiclePricing: { showPriceReductionSignal: true },
    });
  });
});
