import { describe, expect, it } from "vitest";
import {
  DEFAULT_SITE_TEMPLATE_KEY,
  getSiteTemplate,
  listSiteTemplates,
  SITE_TEMPLATES,
} from "./siteTemplates";

describe("site template registry", () => {
  it("contains five stable, unique templates in gallery order", () => {
    const templates = listSiteTemplates();
    expect(templates.map((template) => template.key)).toEqual([
      "luxury",
      "capital",
      "ignition",
      "concierge",
      "exchange",
    ]);
    expect(new Set(templates.map((template) => template.specialty)).size).toBe(5);
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
