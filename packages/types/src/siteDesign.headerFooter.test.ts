import { describe, expect, it } from "vitest";
import {
  normalizeSiteDesign,
  safeNavHref,
  siteDesignToTenantTheme,
  SITE_DESIGN_SCHEMA_VERSION,
} from "./siteDesign";
import { getSiteTemplate } from "./siteTemplates";

/**
 * The public site reads header/footer config through normalizeSiteDesign →
 * siteDesignToTenantTheme. Until 2026-09-26 that path kept only the legacy
 * header keys and dropped the footer entirely, so every tenant rendered the
 * defaults whatever the admin saved (the stored theme itself was intact).
 */
const luxury = getSiteTemplate("luxury");

function publicTheme(raw: Record<string, unknown>) {
  const design = normalizeSiteDesign(
    { schemaVersion: SITE_DESIGN_SCHEMA_VERSION, template: { key: "luxury", version: 1 }, ...raw },
    luxury,
  );
  return siteDesignToTenantTheme(design, luxury, "dark");
}

describe("header config reaches the public theme", () => {
  it("keeps every header field the admin saves", () => {
    const theme = publicTheme({
      header: {
        maxNavItems: 10,
        showCta: true,
        ctaLabel: "Request Invitation",
        variant: "split",
        logoPlacement: "centre",
        sticky: false,
        showVisitorTab: false,
        ctas: [
          { label: "Book a test drive", href: "/contact", style: "primary" },
          { label: "Call us", href: "tel:+33123456789", style: "ghost" },
        ],
      },
    });
    expect(theme.header).toEqual({
      maxNavItems: 10,
      showCta: true,
      ctaLabel: "Request Invitation",
      variant: "split",
      logoPlacement: "centre",
      sticky: false,
      showVisitorTab: false,
      ctas: [
        { label: "Book a test drive", href: "/contact", style: "primary" },
        { label: "Call us", href: "tel:+33123456789", style: "ghost" },
      ],
    });
  });

  it("keeps an explicit empty ctas list (means: no CTA)", () => {
    expect(publicTheme({ header: { ctas: [] } }).header).toEqual({ ctas: [] });
  });

  it("drops unknown enum values and unsafe CTA links", () => {
    const theme = publicTheme({
      header: {
        variant: "diagonal",
        logoPlacement: "right",
        ctas: [
          { label: "x", href: "javascript:alert(1)" },
          { label: "y", href: "//evil.example" },
          { label: "ok", href: "https://dealer.example/book", style: "neon" },
        ],
      },
    });
    expect(theme.header).toEqual({ ctas: [{ label: "ok", href: "https://dealer.example/book" }] });
  });
});

describe("footer config reaches the public theme", () => {
  it("carries the live demo tenant's footer (was: dropped)", () => {
    expect(publicTheme({ footer: { columns: 3, variant: "stacked", showSocial: true } }).footer).toEqual({
      columns: 3,
      variant: "stacked",
      showSocial: true,
    });
  });

  it("keeps links, filtering unsafe or blank ones", () => {
    const footer = publicTheme({
      footer: {
        variant: "columns",
        showNewsletter: false,
        socialLinks: [
          { label: "Instagram", href: "https://instagram.com/dealer" },
          { label: "Bad", href: "javascript:void(0)" },
          { label: "", href: "https://x.com" },
        ],
        legalLinks: [{ label: "Imprint", href: "/imprint" }],
      },
    }).footer;
    expect(footer).toEqual({
      variant: "columns",
      showNewsletter: false,
      socialLinks: [{ label: "Instagram", href: "https://instagram.com/dealer" }],
      legalLinks: [{ label: "Imprint", href: "/imprint" }],
    });
  });

  it("also carries footer through a legacy flat theme", () => {
    const design = normalizeSiteDesign({ footer: { variant: "minimal" } }, luxury);
    expect(siteDesignToTenantTheme(design, luxury, "dark").footer).toEqual({ variant: "minimal" });
  });

  it("omits footer when nothing valid is configured", () => {
    expect(publicTheme({ footer: { variant: "wavy" } }).footer).toBeUndefined();
  });
});

describe("safeNavHref", () => {
  it.each([
    ["/contact", "/contact"],
    ["#top", "#top"],
    ["https://a.example/x", "https://a.example/x"],
    ["mailto:hi@a.example", "mailto:hi@a.example"],
    ["javascript:alert(1)", undefined],
    ["//evil.example", undefined],
    ["data:text/html,hi", undefined],
    ["  ", undefined],
    [42, undefined],
  ])("%s → %s", (input, expected) => {
    expect(safeNavHref(input)).toBe(expected);
  });
});
