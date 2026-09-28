import { describe, expect, it } from "vitest";
import { deriveActiveNavKey, normalizeNavPath } from "./activeNav";

// The demo tenant's live nav (2026-09-26) plus dealer pages that sit in "More".
const DEMO_NAV = [
  { screen: "home" },
  { screen: "products" },
  { screen: "vehicles" },
  { screen: "contact" },
  { screen: "showcase" },
  { screen: "reviews" },
  { screen: "about" },
  { screen: "service" },
  { screen: "specials" },
  { screen: "trade-in" },
];

describe("deriveActiveNavKey", () => {
  it.each([
    ["/", "home"],
    ["/home", "home"],
    ["/home/", "home"],
    ["/vehicles", "vehicles"],
    ["/vehicles/2ae764bd-8de1-4866-86d7-e48fa3cb2b93", "vehicles"],
    ["/vehicles#vehicles?make=Porsche&sort=price_desc", "vehicles"],
    ["/vehicles?tenant=demo", "vehicles"],
    ["/products/lume-one", "products"],
    ["/showcase/experience", "showcase"],
    ["/showcase/intro?part=1", "showcase"],
    ["/contact", "contact"],
    ["/trade-in", "trade-in"],
    ["/specials?utm_source=mail", "specials"],
    ["/Reviews", "reviews"],
  ])("%s → %s", (path, expected) => {
    expect(deriveActiveNavKey(path, DEMO_NAV)).toBe(expected);
  });

  it("marks nothing on a published page that is not in the nav (was: Home)", () => {
    // The confirmed production bug: /financing highlighted "Home".
    expect(deriveActiveNavKey("/financing", DEMO_NAV)).toBeNull();
    expect(deriveActiveNavKey("/privacy", DEMO_NAV)).toBeNull();
  });

  it("marks nothing for a section the tenant does not show in its nav", () => {
    const noProducts = DEMO_NAV.filter((item) => item.screen !== "products");
    expect(deriveActiveNavKey("/products/lume-one", noProducts)).toBeNull();
    expect(deriveActiveNavKey("/account", DEMO_NAV)).toBeNull();
  });

  it("matches a nested custom page to its own item first, then to its parent", () => {
    const nav = [{ screen: "home" }, { screen: "about" }, { screen: "about/team" }];
    expect(deriveActiveNavKey("/about/team", nav)).toBe("about/team");
    expect(deriveActiveNavKey("/about/history", nav)).toBe("about");
  });

  it("never returns a key that is not in the nav", () => {
    for (const path of ["/", "/vehicles/x", "/unknown", "/showcase", "/about"]) {
      const key = deriveActiveNavKey(path, [{ screen: "contact" }]);
      expect(key === null || key === "contact").toBe(true);
    }
  });

  it("returns the item's own spelling of the key", () => {
    expect(deriveActiveNavKey("/trade-in", [{ screen: "Trade-In" }])).toBe("Trade-In");
  });
});

describe("normalizeNavPath", () => {
  it("drops query, hash, duplicate and edge slashes, and case", () => {
    expect(normalizeNavPath("//Vehicles//abc/?x=1#h")).toBe("vehicles/abc");
    expect(normalizeNavPath("/")).toBe("");
  });
});
