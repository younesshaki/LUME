import { describe, expect, it } from "vitest";
import {
  applyTemplateToDesign,
  createDefaultSiteDesign,
  isSiteDesignDocument,
  legacyThemeToSiteDesign,
  normalizeSiteDesign,
  resolveModeBackground,
  resolveModeColors,
  resolveShared,
  safeAssetUrl,
  safeCssToken,
  siteDesignToTenantTheme,
  SITE_DESIGN_SCHEMA_VERSION,
  type SiteDesign,
} from "./siteDesign";
import { DEFAULT_TENANT_THEME } from "./tenantTheme";
import { getSiteTemplate, LUXURY_LIGHT_COLORS } from "./siteTemplates";

const luxury = getSiteTemplate("luxury");

describe("sanitizers", () => {
  it("rejects CSS injection and overly long tokens", () => {
    expect(safeCssToken("#fff")).toBe("#fff");
    expect(safeCssToken("red; background:url(x)")).toBeUndefined();
    expect(safeCssToken("}body{display:none")).toBeUndefined();
    expect(safeCssToken("a".repeat(161))).toBeUndefined();
    expect(safeCssToken(42)).toBeUndefined();
  });

  it("only allows http(s) or root-relative asset URLs", () => {
    expect(safeAssetUrl("https://cdn.example/x.png")).toBe("https://cdn.example/x.png");
    expect(safeAssetUrl("/local/x.png")).toBe("/local/x.png");
    expect(safeAssetUrl("//evil.example/x.png")).toBeUndefined();
    expect(safeAssetUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeAssetUrl("data:image/png;base64,AAAA")).toBeUndefined();
  });
});

describe("legacy compatibility", () => {
  it("normalizes a legacy flat theme to Luxury + dark overrides", () => {
    const legacy = {
      colors: { background: "#010101", gold: "#ffd700" },
      fonts: { body: "Inter" },
      dockVariant: "minimal",
      cinematicIntensity: 0.5,
      header: { maxNavItems: 4, ctaLabel: "Enquire" },
    };
    const design = legacyThemeToSiteDesign(legacy, luxury);
    expect(design.schemaVersion).toBe(SITE_DESIGN_SCHEMA_VERSION);
    expect(design.template).toEqual({ key: "luxury", version: 1 });
    expect(design.modes.dark.colors).toEqual({ background: "#010101", gold: "#ffd700" });
    expect(design.modes.light.colors).toEqual({});
    expect(design.shared.dockVariant).toBe("minimal");
    expect(design.shared.cinematicIntensity).toBe(0.5);
    // Non-editor key carried through verbatim.
    expect(design.header).toEqual({ maxNavItems: 4, ctaLabel: "Enquire" });
  });

  it("the current DEFAULT_TENANT_THEME resolves to the current dark look", () => {
    const design = normalizeSiteDesign(DEFAULT_TENANT_THEME, luxury);
    const dark = resolveModeColors(design, luxury, "dark");
    expect(dark.background).toBe(DEFAULT_TENANT_THEME.colors.background);
    expect(dark.gold).toBe(DEFAULT_TENANT_THEME.colors.gold);
    expect(dark.ink).toBe(DEFAULT_TENANT_THEME.colors.ink);
  });

  it("empty / garbage input falls back to a valid Luxury document", () => {
    for (const bad of [null, undefined, 42, "x", [], { colors: "nope" }]) {
      const design = normalizeSiteDesign(bad, luxury);
      expect(design.schemaVersion).toBe(SITE_DESIGN_SCHEMA_VERSION);
      expect(design.template.key).toBe("luxury");
      // Resolves to Luxury defaults for both modes without throwing.
      expect(resolveModeColors(design, luxury, "dark").background).toBe(
        DEFAULT_TENANT_THEME.colors.background,
      );
      expect(resolveModeColors(design, luxury, "light").background).toBe(
        LUXURY_LIGHT_COLORS.background,
      );
    }
  });
});

describe("normalizeSiteDesign (v2 documents)", () => {
  it("strips unsafe colors and unknown asset slots but keeps valid data", () => {
    const raw = {
      schemaVersion: 2,
      template: { key: "luxury", version: 1 },
      shared: { cinematicIntensity: 9 }, // clamped to 1.5
      modes: {
        dark: {
          colors: { background: "#000", ink: "red; evil" },
          assets: {
            siteBackground: { url: "https://cdn/x.png", size: "cover", overlayOpacity: 5 },
            bogusSlot: { url: "https://cdn/y.png" },
          },
        },
        light: { colors: { background: "#fff" } },
      },
    };
    const design = normalizeSiteDesign(raw, luxury);
    expect(design.shared.cinematicIntensity).toBe(1.5);
    expect(design.modes.dark.colors).toEqual({ background: "#000" }); // "red; evil" dropped
    const bg = design.modes.dark.assets?.siteBackground;
    expect(bg?.url).toBe("https://cdn/x.png");
    expect(bg?.size).toBe("cover");
    expect(bg?.overlayOpacity).toBe(1); // clamped
    // Unknown slot not carried onto the typed document.
    expect(Object.keys(design.modes.dark.assets ?? {})).toEqual(["siteBackground"]);
  });

  it("preserves header/branding/vehiclePricing round-trip", () => {
    const raw = {
      schemaVersion: 2,
      template: { key: "luxury", version: 1 },
      shared: {},
      modes: { dark: {}, light: {} },
      header: { maxNavItems: 5, showCta: false },
      branding: { logoUrl: "https://cdn/logo.png" },
      vehiclePricing: { showPriceReductionSignal: true },
    };
    const design = normalizeSiteDesign(raw, luxury);
    expect(design.header).toEqual({ maxNavItems: 5, showCta: false });
    expect(design.branding).toEqual({ logoUrl: "https://cdn/logo.png" });
    expect(design.vehiclePricing).toEqual({ showPriceReductionSignal: true });
  });

  it("isSiteDesignDocument discriminates v2 from legacy", () => {
    expect(isSiteDesignDocument({ schemaVersion: 2 })).toBe(true);
    expect(isSiteDesignDocument({ colors: {} })).toBe(false);
    expect(isSiteDesignDocument(null)).toBe(false);
  });
});

describe("mode isolation & resolution", () => {
  const base: SiteDesign = {
    schemaVersion: 2,
    template: { key: "luxury", version: 1 },
    shared: {},
    modes: {
      dark: { colors: { background: "#111" } },
      light: { colors: { background: "#eee" } },
    },
  };

  it("dark and light resolve independently", () => {
    expect(resolveModeColors(base, luxury, "dark").background).toBe("#111");
    expect(resolveModeColors(base, luxury, "light").background).toBe("#eee");
  });

  it("editing one mode does not mutate the other", () => {
    const edited: SiteDesign = {
      ...base,
      modes: { ...base.modes, dark: { colors: { background: "#222" } } },
    };
    expect(edited.modes.light.colors?.background).toBe("#eee");
    expect(base.modes.dark.colors?.background).toBe("#111"); // original untouched
  });

  it("falls back to template defaults for unset color roles", () => {
    const dark = resolveModeColors(base, luxury, "dark");
    expect(dark.background).toBe("#111"); // override
    expect(dark.gold).toBe(DEFAULT_TENANT_THEME.colors.gold); // template default
  });

  it("light background falls back to the flat Luxury color, never a dark image", () => {
    // No custom light background → resolveModeBackground returns undefined (flat
    // color used), and Luxury ships no default light image.
    expect(resolveModeBackground(base, luxury, "light")).toBeUndefined();
    expect(resolveModeColors(base, luxury, "light").background).toBe("#eee");
  });
});

describe("applyTemplateToDesign", () => {
  it("replaces design values but preserves non-editor keys", () => {
    const current: SiteDesign = {
      schemaVersion: 2,
      template: { key: "luxury", version: 1 },
      shared: { cinematicIntensity: 0.2 },
      modes: { dark: { colors: { background: "#abc" } }, light: {} },
      header: { maxNavItems: 3 },
      branding: { logoUrl: "https://cdn/logo.png" },
      vehiclePricing: { showPriceReductionSignal: true },
    };
    const applied = applyTemplateToDesign(current, luxury);
    // Design reset to template defaults.
    expect(applied.modes.dark.colors?.background).toBe(DEFAULT_TENANT_THEME.colors.background);
    expect(applied.shared.cinematicIntensity).toBe(DEFAULT_TENANT_THEME.cinematicIntensity);
    // Preserved.
    expect(applied.header).toEqual({ maxNavItems: 3 });
    expect(applied.branding).toEqual({ logoUrl: "https://cdn/logo.png" });
    expect(applied.vehiclePricing).toEqual({ showPriceReductionSignal: true });
  });
});

describe("createDefaultSiteDesign", () => {
  it("has no overrides and resolves entirely to the template", () => {
    const design = createDefaultSiteDesign(luxury);
    expect(design.modes.dark.colors ?? {}).toEqual({});
    expect(resolveModeColors(design, luxury, "dark").background).toBe(
      DEFAULT_TENANT_THEME.colors.background,
    );
    expect(resolveShared(design, luxury).dockVariant).toBe(DEFAULT_TENANT_THEME.dockVariant);
  });
});

describe("siteDesignToTenantTheme bridge", () => {
  it("produces a legacy-shaped theme for a given mode", () => {
    const design = normalizeSiteDesign(DEFAULT_TENANT_THEME, luxury);
    const darkTheme = siteDesignToTenantTheme(design, luxury, "dark");
    expect(darkTheme.colors?.background).toBe(DEFAULT_TENANT_THEME.colors.background);
    const lightTheme = siteDesignToTenantTheme(design, luxury, "light");
    expect(lightTheme.colors?.background).toBe(LUXURY_LIGHT_COLORS.background);
  });
});
