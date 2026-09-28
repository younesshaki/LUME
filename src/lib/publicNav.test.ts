import { describe, expect, it } from "vitest";
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
