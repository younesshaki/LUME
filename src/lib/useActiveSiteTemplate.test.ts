import { describe, expect, it } from "vitest";
import { SITE_TEMPLATES } from "@lume/types";
import { allowsGooeyNav, isAutomotiveEditorial } from "./useActiveSiteTemplate";

describe("template-aware header nav", () => {
  it("Template Glo3D never gets the animated nav", () => {
    expect(allowsGooeyNav(true, SITE_TEMPLATES.glo3d)).toBe(false);
  });

  it("other templates keep it when the build flag is on", () => {
    expect(allowsGooeyNav(true, SITE_TEMPLATES.luxury)).toBe(true);
    expect(allowsGooeyNav(false, SITE_TEMPLATES.luxury)).toBe(false);
  });

  it("renders the plain nav until the template is known", () => {
    expect(allowsGooeyNav(true, null)).toBe(false);
  });

  it("identifies the automotive-editorial layout", () => {
    expect(isAutomotiveEditorial(SITE_TEMPLATES.glo3d)).toBe(true);
    expect(isAutomotiveEditorial(SITE_TEMPLATES.capital)).toBe(false);
  });
});
