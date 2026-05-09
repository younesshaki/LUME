import { describe, expect, it } from "vitest";
import {
  PRODUCTS,
  getProductById,
  getShowcasePreviewForChapter,
} from "./catalog";

describe("product catalog", () => {
  it("keeps the current product set centralized", () => {
    expect(PRODUCTS.map((product) => product.id)).toEqual([
      "red-bull",
      "starbucks",
      "moet",
      "ysl-femme",
      "ysl-homme",
      "hermes",
      "rolex",
    ]);
  });

  it("returns product details by id", () => {
    expect(getProductById("ysl-femme")?.imageKey).toBe("YSLfemmeLUME.png");
    expect(getProductById("missing")).toBeUndefined();
  });

  it("maps showcase preview chapters to their product images", () => {
    expect(getShowcasePreviewForChapter("showcase-chapter-1", 0).id).toBe(
      "red-bull"
    );
    expect(getShowcasePreviewForChapter("showcase-chapter-2", 1).id).toBe(
      "starbucks"
    );
    expect(getShowcasePreviewForChapter("showcase-chapter-3", 2).id).toBe(
      "ysl-femme"
    );
  });
});
