import { describe, expect, it } from "vitest";
import { validatePageBlocksDocument } from "./validation";
import { DEFAULT_PAGES } from "./defaultPages";
import { DEALER_PAGE_TEMPLATES } from "./dealerPageTemplates";

describe("dealer page templates", () => {
  it("ships the 8 Tier-1 templates in the expected order", () => {
    expect(DEALER_PAGE_TEMPLATES.map((page) => page.slug)).toEqual([
      "financing",
      "trade-in",
      "specials",
      "service",
      "about",
      "reviews",
      "faq",
      "privacy",
    ]);
  });

  it("every template's block document validates against the live descriptors", () => {
    for (const page of DEALER_PAGE_TEMPLATES) {
      const result = validatePageBlocksDocument(page.blocks);
      expect(result.blockErrors, `${page.slug}: ${JSON.stringify(result.blockErrors)}`)
        .toEqual({});
      expect(result.ok).toBe(true);
      expect(page.blocks.blocks.length).toBeGreaterThan(0);
    }
  });

  it("has unique slugs that never collide with the reserved default pages", () => {
    const reserved = new Set(DEFAULT_PAGES.map((page) => page.slug));
    const slugs = DEALER_PAGE_TEMPLATES.map((page) => page.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(reserved.has(slug)).toBe(false);
    for (const page of DEALER_PAGE_TEMPLATES) expect(page.isReserved).toBe(false);
  });

  it("uses unique, stable block ids within each page and ascending nav order", () => {
    const orders: number[] = [];
    for (const page of DEALER_PAGE_TEMPLATES) {
      const ids = page.blocks.blocks.map((block) => block.id);
      expect(new Set(ids).size, page.slug).toBe(ids.length);
      orders.push(page.navOrder);
    }
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });

  it("the legal page is real boilerplate, not filler — consent, deletion rights, and terms", () => {
    const privacy = DEALER_PAGE_TEMPLATES.find((page) => page.slug === "privacy");
    const text = privacy?.blocks.blocks
      .map((block) => String(block.props.body ?? ""))
      .join("\n") ?? "";
    expect(text).toContain("PRIVACY POLICY");
    expect(text).toContain("TERMS OF SERVICE");
    expect(text).toMatch(/consent/i);
    expect(text).toMatch(/delete|erasure/i);
    expect(text).toMatch(/do not sell your personal data/i);
    expect(text).toMatch(/not an authoritative source/i);
  });

  it("every template includes at least one conversion or trust element", () => {
    const conversionTypes = new Set([
      "lead-capture-form",
      "trade-in-form",
      "service-booking",
      "test-drive-booking",
      "finance-calculator",
      "cta-banner",
      "newsletter-signup",
      "whatsapp-cta",
    ]);
    for (const page of DEALER_PAGE_TEMPLATES) {
      if (page.slug === "privacy") continue; // legal is informational by design
      const types = new Set(page.blocks.blocks.map((block) => block.type));
      expect(
        [...types].some((type) => conversionTypes.has(type)),
        `${page.slug} should give visitors a next step`,
      ).toBe(true);
    }
  });
});
