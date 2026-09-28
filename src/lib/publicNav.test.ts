import { describe, expect, it } from "vitest";
import { navPlacements } from "@lume/types";
import { buildPublishedNavEntries } from "./publicNav";

describe("buildPublishedNavEntries", () => {
  it("keeps every published page while marking only configured overflow for More", () => {
    const entries = buildPublishedNavEntries(
      [
        { slug: "home", title: "Home", navOrder: 1 },
        { slug: "vehicles", title: "Inventory", navOrder: 2 },
        { slug: "finance", title: "Finance", navOrder: 3 },
        { slug: "trade-in", title: "Trade in", navOrder: 4 },
      ],
      { maxNavItems: 2 },
    );

    expect(entries.map((entry) => entry.slug)).toEqual([
      "home",
      "vehicles",
      "finance",
      "trade-in",
    ]);
    expect(entries.map((entry) => entry.headerOverflow)).toEqual([false, false, true, true]);
  });

  it("does not count the vehicle-detail layout as an item in More", () => {
    const entries = buildPublishedNavEntries(
      [
        { slug: "home", title: "Home", navOrder: 1 },
        { slug: "vehicle", title: "Vehicle", navOrder: 2 },
        { slug: "finance", title: "Finance", navOrder: 3 },
      ],
      { maxNavItems: 1 },
    );

    expect(entries.map((entry) => entry.slug)).toEqual(["home", "finance"]);
    expect(entries.map((entry) => entry.headerOverflow)).toEqual([false, true]);
  });
});

describe("public nav and the admin Pages list agree", () => {
  // The admin shows placements from navPlacements(); the live site builds its
  // nav from buildPublishedNavEntries(). Both go through selectHeaderNav — this
  // pins that they can never describe different navigation.
  const pages = [
    { slug: "home", title: "Home", navOrder: 0 },
    { slug: "vehicles", title: "Inventory", navOrder: 1 },
    { slug: "faq", title: "FAQ", navOrder: 2 },
    { slug: "contact", title: "Contact", navOrder: 3 },
    { slug: "about", title: "About", navOrder: 4 },
    { slug: "vehicle", title: "Vehicle", navOrder: 5 },
  ];

  it.each([
    { maxNavItems: 2 },
    { maxNavItems: 2, hiddenNavSlugs: ["faq"] },
    { maxNavItems: 10, hiddenNavSlugs: ["home", "about"] },
    { maxNavItems: 1, hiddenNavSlugs: ["vehicles", "contact"] },
  ])("%o", (header) => {
    const live = Object.fromEntries(
      buildPublishedNavEntries(pages, header).map((entry) => [entry.slug, entry.headerOverflow ? "more" : "header"]),
    );
    const admin = Object.fromEntries(
      [...navPlacements(pages, header)].filter(([, placement]) => placement !== "hidden"),
    );
    expect(live).toEqual(admin);
    // Hidden pages are absent from every public nav surface.
    for (const slug of header.hiddenNavSlugs ?? []) {
      expect(buildPublishedNavEntries(pages, header).some((entry) => entry.slug === slug)).toBe(false);
    }
  });
});
