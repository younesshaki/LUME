import { describe, expect, it } from "vitest";
import {
  BRANDING_THEME_DEFAULTS,
  brandingFormFromTheme,
  themeFromBrandingForm,
  toColorInputValue,
} from "./themeForm";

describe("branding theme form helpers", () => {
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
