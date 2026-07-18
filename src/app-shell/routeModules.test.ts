import { describe, expect, it } from "vitest";
import { routeModuleIntentFor } from "./routeModules";

describe("route module intent", () => {
  it("keeps public route chunks isolated when the page renderer is disabled", () => {
    expect(routeModuleIntentFor("vehicles", false)).toBe("vehicles");
    expect(routeModuleIntentFor("showcase", false)).toBe("showcase");
    expect(routeModuleIntentFor("account", false)).toBe("account");
  });

  it("uses the shared page-renderer chunk for configured and custom pages", () => {
    expect(routeModuleIntentFor("vehicles", true)).toBe("vehicles-page-renderer");
    expect(routeModuleIntentFor("about-us", false)).toBe("page-renderer");
  });

  it("never speculatively imports admin or Three.js experience routes", () => {
    expect(routeModuleIntentFor("admin", false)).toBe("none");
    expect(routeModuleIntentFor("experience", false)).toBe("none");
    expect(routeModuleIntentFor("titlecard", false)).toBe("none");
  });
});
