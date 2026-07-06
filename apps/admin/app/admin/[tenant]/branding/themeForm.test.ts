import { describe, expect, it } from "vitest";
import { DEFAULT_TENANT_THEME } from "@lume/types";
import {
  BRANDING_THEME_DEFAULTS,
  brandingFormFromTheme,
  themeFromBrandingForm,
  toColorInputValue,
} from "./themeForm";

describe("branding theme form helpers", () => {
  it("stays in lockstep with the provisioning starter theme", () => {
    // provisionTenant seeds DEFAULT_TENANT_THEME; the editor must read it
    // back without falling back on any key, and serialize it unchanged.
    expect(brandingFormFromTheme(DEFAULT_TENANT_THEME)).toEqual(BRANDING_THEME_DEFAULTS);
    expect(themeFromBrandingForm(BRANDING_THEME_DEFAULTS)).toEqual(DEFAULT_TENANT_THEME);
  });

  it("fills missing theme values from defaults", () => {
    expect(brandingFormFromTheme({ colors: { gold: "#f5c86a" } })).toMatchObject({
      colors: {
        gold: "#f5c86a",
        ink: BRANDING_THEME_DEFAULTS.colors.ink,
      },
      dockVariant: "default",
    });
  });

  it("supports the nested public dock variant shape", () => {
    expect(brandingFormFromTheme({ dock: { variant: "minimal" } }).dockVariant).toBe("minimal");
  });

  it("serializes and clamps the editable theme form", () => {
    expect(
      themeFromBrandingForm({
        ...BRANDING_THEME_DEFAULTS,
        dockVariant: "floating",
        cinematicIntensity: 3,
      })
    ).toMatchObject({
      dockVariant: "floating",
      cinematicIntensity: 1.5,
    });
  });

  it("falls back when a text color value cannot drive a color picker", () => {
    expect(toColorInputValue("rgba(255, 255, 255, 0.5)")).toBe("#000000");
    expect(toColorInputValue("#fff8ec")).toBe("#fff8ec");
  });
});
