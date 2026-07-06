import { describe, expect, it } from "vitest";
import { clampMaxNavItems, selectHeaderNav } from "./headerNav";

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
