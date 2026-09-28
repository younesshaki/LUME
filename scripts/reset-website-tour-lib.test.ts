import { describe, expect, it } from "vitest";
import { parseResetWebsiteTourArgs } from "./reset-website-tour-lib";

describe("Website Hub tour reset arguments", () => {
  it("defaults to dry run for an enabled demo tenant", () => {
    expect(parseResetWebsiteTourArgs(["--tenant", "demo-sean"])).toEqual({
      tenantSlug: "demo-sean",
      apply: false,
    });
  });

  it("requires a deliberate apply flag", () => {
    expect(parseResetWebsiteTourArgs(["--tenant", "DEMO-MAX", "--apply"])).toEqual({
      tenantSlug: "demo-max",
      apply: true,
    });
  });

  it("rejects unknown or malformed targets before reading any environment", () => {
    expect(() => parseResetWebsiteTourArgs([])).toThrow(/--tenant/i);
    expect(() => parseResetWebsiteTourArgs(["--tenant", "default"])).toThrow(/enabled demo tenant/i);
    expect(() => parseResetWebsiteTourArgs(["--tenant", "../demo-sean"])).toThrow(/--tenant/i);
  });
});
