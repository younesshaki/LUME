import { describe, expect, it } from "vitest";
import {
  DEFAULT_SITE_TEMPLATE_KEY,
  getSiteTemplate,
  listSiteTemplates,
  SITE_TEMPLATES,
} from "./siteTemplates";

describe("site template registry", () => {
  it("contains six stable, unique templates in gallery order", () => {
    const templates = listSiteTemplates();
    expect(templates.map((template) => template.key)).toEqual([
      "luxury",
      "capital",
      "ignition",
      "concierge",
      "exchange",
      "glo3d",
    ]);
    // The five original conversion strategies stay distinct; Glo3D is a
    // presentation layer on the test-drive journey.
    expect(new Set(templates.slice(0, 5).map((template) => template.specialty)).size).toBe(5);
    expect(SITE_TEMPLATES.glo3d.specialty).toBe("test-drive");
    expect(DEFAULT_SITE_TEMPLATE_KEY).toBe("luxury");
  });

  it.each(Object.values(SITE_TEMPLATES))(
    "$name has deliberate and complete dark/light defaults",
    (template) => {
      const dark = template.modes.dark.colors;
      const light = template.modes.light.colors;

      expect(dark?.background).toMatch(/^#/);
      expect(light?.background).toMatch(/^#/);
      expect(dark?.background).not.toBe(light?.background);
      expect(dark?.ink).not.toBe(light?.ink);
      expect(dark?.gold).not.toBe(light?.gold);
      expect(template.conversion.primaryAction).not.toBe(
        template.conversion.secondaryAction,
      );
      expect(template.conversion.trustPoints).toHaveLength(3);
    },
  );

  it("falls back to Luxury for malformed or future keys", () => {
    expect(getSiteTemplate(undefined).key).toBe("luxury");
    expect(getSiteTemplate("not-a-template").key).toBe("luxury");
  });
});

/** WCAG 2.x contrast ratio for two #rrggbb colours. */
function contrast(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
    const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

describe("Template Glo3D", () => {
  const glo3d = SITE_TEMPLATES.glo3d;

  it("is registered sixth with the automotive-editorial layout", () => {
    expect(glo3d.name).toBe("Template Glo3D");
    expect(glo3d.visual.layout).toBe("automotive-editorial");
    expect(glo3d.visual.surface).toBe("solid");
    expect(getSiteTemplate("glo3d").key).toBe("glo3d");
  });

  it.each(["dark", "light"] as const)("keeps readable contrast in %s mode", (mode) => {
    const colors = glo3d.modes[mode].colors!;
    // Body text and the accent (links, buttons, active nav) clear WCAG AA.
    expect(contrast(colors.ink!, colors.background!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.muted!, colors.background!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.gold!, colors.background!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.ink!, colors.panel!)).toBeGreaterThanOrEqual(4.5);
    // Tertiary text is for large or secondary labels only.
    expect(contrast(colors.soft!, colors.background!)).toBeGreaterThanOrEqual(3);
  });

  it("uses flat colours only: no translucency or gradients", () => {
    for (const mode of ["dark", "light"] as const) {
      for (const value of Object.values(glo3d.modes[mode].colors!)) {
        expect(value).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });
});
