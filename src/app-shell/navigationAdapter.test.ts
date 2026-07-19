import { describe, expect, it } from "vitest";
import { resolveNavigatePath } from "./navigationAdapter";

describe("navigationAdapter", () => {
  it("resolves canonical and legacy navigation targets to browser paths", () => {
    expect(resolveNavigatePath({ route: "products" })).toBe("/products");
    expect(
      resolveNavigatePath({
        route: "vehicles",
        inventoryState: "#vehicles?make=BMW&priceMax=50000",
      }),
    ).toBe("/vehicles#vehicles?make=BMW&priceMax=50000");
    expect(resolveNavigatePath({ route: "adminDashboard" })).toBe(
      "/admin/dashboard"
    );
    expect(
      resolveNavigatePath({ route: "productDetail", productId: "red-bull" })
    ).toBe("/products/red-bull");
    expect(resolveNavigatePath({ route: "titlecard" })).toBe("/showcase/intro");
    expect(
      resolveNavigatePath({
        route: "experience",
        partIndex: 1,
        chapterIndex: 2,
      })
    ).toBe("/showcase/experience?part=1&chapter=2");
  });
});
