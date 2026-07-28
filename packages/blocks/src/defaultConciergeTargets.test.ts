import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONCIERGE_TARGETS,
  targetsForAvailablePages,
} from "./defaultConciergeTargets";

describe("default concierge targets", () => {
  it("keeps keys and destinations within the migration-073 constraints", () => {
    for (const target of DEFAULT_CONCIERGE_TARGETS) {
      expect(target.key).toMatch(/^[a-z][a-z0-9-]+$/);
      expect(target.key.length).toBeGreaterThanOrEqual(2);
      expect(target.destination.startsWith("/")).toBe(true);
      expect(target.destination.startsWith("//")).toBe(false);
      expect(target.destination).not.toMatch(/^\/(admin|api)(\/|$)/);
      expect(target.destination).not.toContain("?");
      expect(target.destination).not.toContain("://");
      expect(target.aiDescription.trim().length).toBeGreaterThan(0);
      expect(target.aiDescription.length).toBeLessThanOrEqual(500);
      expect(target.label.length).toBeLessThanOrEqual(80);
    }
  });

  it("uses unique keys and sort orders", () => {
    const keys = DEFAULT_CONCIERGE_TARGETS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    const orders = DEFAULT_CONCIERGE_TARGETS.map((t) => t.sortOrder);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it("marks the money pages as conversion targets", () => {
    const conversion = DEFAULT_CONCIERGE_TARGETS.filter((t) => t.isConversion).map((t) => t.key);
    expect(conversion).toEqual(["financing", "trade-in", "service", "specials"]);
  });

  // A target pointing at a page the tenant never seeded is a 404 the
  // concierge would confidently recommend.
  it("only returns targets whose page exists", () => {
    const got = targetsForAvailablePages(["financing", "faq"]).map((t) => t.key);
    expect(got).toEqual(["financing", "faq"]);
  });

  it("returns nothing for a tenant with no dealer pages", () => {
    expect(targetsForAvailablePages([])).toEqual([]);
  });
});
