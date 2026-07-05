import { describe, expect, it } from "vitest";
import { slugifyTenantName } from "./provisioning";

describe("slugifyTenantName", () => {
  it("lowercases, strips punctuation, hyphenates", () => {
    expect(slugifyTenantName("Acme Motors!")).toBe("acme-motors");
    expect(slugifyTenantName("  Élan   Café  ")).toBe("elan-cafe");
    expect(slugifyTenantName("A&B_C.D")).toBe("a-b-c-d");
  });

  it("trims leading/trailing hyphens and caps length", () => {
    expect(slugifyTenantName("---x---")).toBe("x");
    expect(slugifyTenantName("a".repeat(100))).toHaveLength(40);
  });

  it("returns empty string for unusable names", () => {
    expect(slugifyTenantName("!!!")).toBe("");
  });
});
