import { describe, expect, it } from "vitest";
import { footerContent, LUME_HOUSE_TENANT_SLUG } from "./footerContent";

describe("footerContent", () => {
  it("a dealership never shows LUME's hotel tagline, Monaco address or © LUME", () => {
    const content = footerContent({ tenantSlug: "demo", tenantName: "LUME Demo", footer: undefined });
    expect(content.tagline).toBeNull();
    expect(content.address).toBeNull();
    expect(content.copyrightName).toBe("LUME Demo");
  });

  it("a dealership with showSocial but no configured links shows none, not generic ones", () => {
    // The live demo tenant's exact shape on 2026-09-26.
    const content = footerContent({
      tenantSlug: "demo",
      tenantName: "LUME Demo",
      footer: { columns: 3, variant: "stacked", showSocial: true },
    });
    expect(content.socialLinks).toEqual([]);
    expect(content.useDefaultSocial).toBe(false);
  });

  it("a dealership's configured social links are shown; blank entries are dropped", () => {
    const content = footerContent({
      tenantSlug: "demo",
      tenantName: "LUME Demo",
      footer: {
        socialLinks: [
          { label: "Instagram", href: "https://instagram.com/luxurymotors" },
          { label: " ", href: "https://example.com" },
        ],
      },
    });
    expect(content.socialLinks).toEqual([
      { label: "Instagram", href: "https://instagram.com/luxurymotors" },
    ]);
  });

  it("showSocial false hides social links even when configured", () => {
    const content = footerContent({
      tenantSlug: "demo",
      tenantName: "x",
      footer: { showSocial: false, socialLinks: [{ label: "IG", href: "https://i.g" }] },
    });
    expect(content.socialLinks).toEqual([]);
    expect(content.useDefaultSocial).toBe(false);
  });

  it("the LUME house site keeps its historical copy and default social links", () => {
    const content = footerContent({ tenantSlug: LUME_HOUSE_TENANT_SLUG, tenantName: "LUME", footer: undefined });
    expect(content.tagline).toMatch(/hotel/);
    expect(content.address).toMatch(/Monaco/);
    expect(content.copyrightName).toBe("LUME");
    expect(content.useDefaultSocial).toBe(true);
  });

  it("minimal drops nav and address but keeps the legal bar", () => {
    const house = footerContent({ tenantSlug: LUME_HOUSE_TENANT_SLUG, tenantName: "LUME", footer: { variant: "minimal" } });
    expect(house.showNav).toBe(false);
    expect(house.address).toBeNull();
    expect(house.legalLinks.length).toBeGreaterThan(0);
  });

  it("columns are clamped to 2–4, and an unknown tenant name leaves the © name empty", () => {
    expect(footerContent({ tenantSlug: "a", tenantName: null, footer: { columns: 9 } }).columns).toBe(4);
    expect(footerContent({ tenantSlug: "a", tenantName: null, footer: undefined }).copyrightName).toBe("");
  });

  it("no longer duplicates Privacy as 'Legal' by default", () => {
    const links = footerContent({ tenantSlug: "demo", tenantName: "x", footer: undefined }).legalLinks;
    expect(links).toEqual([{ label: "Privacy", href: "/privacy" }]);
  });
});
