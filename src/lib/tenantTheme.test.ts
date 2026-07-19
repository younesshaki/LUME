import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyTenantSiteDesign,
  applyTenantTheme,
  clearTenantThemeCacheForTests,
  getTenantSiteDesignStyles,
  loadTenantSiteDesign,
  loadTenantTheme,
  tenantThemeToCssVariables,
} from "./tenantTheme";
import { createDefaultSiteDesign, getSiteTemplate } from "@lume/types";

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

    await expect(loadTenantTheme("default", client as never)).resolves.toMatchObject({
      colors: { background: "#000000", ink: "#fff8ec" },
    });
    expect(client.rpc).toHaveBeenCalledWith("get_tenant_theme", { p_slug: "default" });
  });

  it("normalizes malformed public documents to Luxury", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: [{ theme: { schemaVersion: 2, modes: "bad" } }], error: null }),
    };
    const design = await loadTenantSiteDesign("malformed", client as never);
    expect(design.template).toEqual({ key: "luxury", version: 1 });
    expect(design.modes).toEqual({ dark: { colors: {} }, light: { colors: {} } });
  });

  it("applies only the active mode background and swaps immediately", () => {
    const design = createDefaultSiteDesign(getSiteTemplate("luxury"));
    design.modes.dark.assets = { siteBackground: { url: "https://cdn.example/dark.webp" } };
    design.modes.light.assets = { siteBackground: { url: "https://cdn.example/light.webp", position: "top" } };

    applyTenantSiteDesign(design, "dark", document.documentElement);
    expect(document.documentElement.style.getPropertyValue("--theme-site-background-image"))
      .toContain("dark.webp");
    expect(document.documentElement.style.getPropertyValue("--theme-site-background-image"))
      .not.toContain("light.webp");

    applyTenantSiteDesign(design, "light", document.documentElement);
    expect(document.documentElement.style.getPropertyValue("--theme-site-background-image"))
      .toContain("light.webp");
    expect(document.documentElement.style.getPropertyValue("--theme-lume-background")).toBe("#f4efe5");
    expect(document.documentElement.style.getPropertyValue("--theme-site-background-position")).toBe("top");
  });

  it("applies only allowlisted registry layout metadata to the root", () => {
    const exchange = createDefaultSiteDesign(getSiteTemplate("exchange"));
    applyTenantSiteDesign(exchange, "dark", document.documentElement);
    expect(document.documentElement.dataset.lumeTemplate).toBe("exchange");
    expect(document.documentElement.dataset.lumeTemplateLayout).toBe("equity-split");
    expect(document.documentElement.dataset.lumeTemplateSpecialty).toBe("trade-in");

    applyTenantTheme({}, document.documentElement);
    expect(document.documentElement.dataset.lumeTemplate).toBeUndefined();
  });

  it("resolves destination-mode tokens without mutating the current document", () => {
    const design = createDefaultSiteDesign(getSiteTemplate("luxury"));
    design.modes.dark.assets = { siteBackground: { url: "https://cdn.example/dark.webp" } };
    design.modes.light.assets = { siteBackground: { url: "https://cdn.example/light.webp" } };

    const styles = getTenantSiteDesignStyles(design, "light");

    expect(styles.variables["--theme-site-background-image"]).toContain("light.webp");
    expect(styles.variables["--theme-site-background-image"]).not.toContain("dark.webp");
    expect(styles.variables["--theme-lume-background"]).toBe("#f4efe5");
    expect(document.documentElement.style.getPropertyValue("--theme-site-background-image")).toBe("");
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

  it("normalizes tenant branding URLs and applies managed favicon links", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: [{ theme: { branding: {
          logoUrl: "https://cdn.example/logo.svg",
          favicon32Url: "https://cdn.example/favicon-32.png",
          favicon192Url: "javascript:alert(1)",
        } } }],
        error: null,
      }),
    };
    const theme = await loadTenantTheme("branded", client as never);
    expect(theme.branding).toEqual({
      logoUrl: "https://cdn.example/logo.svg",
      favicon32Url: "https://cdn.example/favicon-32.png",
      favicon192Url: undefined,
    });

    applyTenantTheme(theme, document.documentElement);
    const links = document.querySelectorAll<HTMLLinkElement>("link[data-lume-tenant-favicon]");
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("sizes")).toBe("32x32");
    expect(links[0]?.href).toBe("https://cdn.example/favicon-32.png");

    applyTenantTheme({}, document.documentElement);
    expect(document.querySelector("link[data-lume-tenant-favicon]")).toBeNull();
  });
});
