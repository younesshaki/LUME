import { describe, expect, it } from "vitest";
import { isNavigablePageSlug, clampMaxNavItems, selectHeaderNav } from "./headerNav";

const page = (slug: string, navOrder: number) => ({ slug, title: slug, navOrder });

describe("clampMaxNavItems", () => {
  it("falls back for missing/garbage and clamps to [1, 10]", () => {
    expect(clampMaxNavItems(undefined)).toBe(6);
    expect(clampMaxNavItems(Number.NaN)).toBe(6);
    expect(clampMaxNavItems(0)).toBe(1);
    expect(clampMaxNavItems(99)).toBe(10);
    expect(clampMaxNavItems(4.6)).toBe(5);
  });
});

describe("selectHeaderNav", () => {
  const pages = [page("home", 0), page("vehicles", 2), page("about-us", 1), page("faq", 3)];

  it("orders by navOrder and splits at maxNavItems", () => {
    const { visible, overflow } = selectHeaderNav(pages, { maxNavItems: 3 });
    expect(visible.map((p) => p.slug)).toEqual(["home", "about-us", "vehicles"]);
    expect(overflow.map((p) => p.slug)).toEqual(["faq"]);
  });

  it("shows everything when under the cap and defaults the cap", () => {
    const { visible, overflow } = selectHeaderNav(pages, undefined);
    expect(visible).toHaveLength(4);
    expect(overflow).toHaveLength(0);
  });

  it("breaks navOrder ties by title for stability", () => {
    const { visible } = selectHeaderNav([page("b", 1), page("a", 1)], { maxNavItems: 2 });
    expect(visible.map((p) => p.slug)).toEqual(["a", "b"]);
  });
});

describe("template pages are never navigable", () => {
  const page = (slug: string, navOrder: number) => ({
    slug,
    title: slug,
    navOrder,
  });

  // `vehicle` is the VDP layout. Publishing it changes every /vehicles/:id
  // page; it is not somewhere a visitor can go. list_published_nav_pages
  // returns it like any other published page, so it has to be filtered here.
  it("excludes the vehicle-detail template from the header", () => {
    const { visible, overflow } = selectHeaderNav(
      [page("home", 0), page("vehicle", 1), page("about", 2)],
      { maxNavItems: 6 },
    );
    const slugs = [...visible, ...overflow].map((p) => p.slug);
    expect(slugs).not.toContain("vehicle");
    expect(slugs).toEqual(["home", "about"]);
  });

  // It must not silently eat a nav slot either.
  it("does not let a template page consume a nav slot", () => {
    const { visible } = selectHeaderNav(
      [page("vehicle", 0), page("a", 1), page("b", 2)],
      { maxNavItems: 2 },
    );
    expect(visible.map((p) => p.slug)).toEqual(["a", "b"]);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(isNavigablePageSlug(" Vehicle ")).toBe(false);
    expect(isNavigablePageSlug("VEHICLE")).toBe(false);
    // Not the same page as the inventory listing, which IS navigable.
    expect(isNavigablePageSlug("vehicles")).toBe(true);
  });
});
