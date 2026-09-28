import { describe, expect, it } from "vitest";
import { isNavigablePageSlug } from "@lume/types";
import { validatePageBlocksDocument } from "./validation";
import { GLO3D_MEDIA_BASE, GLO3D_STARTER_PAGES, templateNewBlockDefaults } from "./glo3dStarterPages";
import { validateBlock } from "./validation";

describe("Template Glo3D starter pages", () => {
  it("covers home, inventory and the vehicle layout", () => {
    expect(GLO3D_STARTER_PAGES.map((page) => page.slug)).toEqual(["home", "vehicles", "vehicle"]);
    expect(isNavigablePageSlug("vehicle")).toBe(false);
  });

  it("every block document validates against the live block descriptors", () => {
    for (const page of GLO3D_STARTER_PAGES) {
      const result = validatePageBlocksDocument(page.blocks);
      expect(result.blockErrors, `${page.slug}: ${JSON.stringify(result.blockErrors)}`).toEqual({});
      expect(result.ok).toBe(true);
    }
  });

  it("uses the template's photo designs and licensed photo set only", () => {
    const home = GLO3D_STARTER_PAGES[0].blocks.blocks;
    expect(home[0]).toMatchObject({ type: "hero", props: { variant: "search" } });
    expect(GLO3D_STARTER_PAGES[1].blocks.blocks[0]).toMatchObject({ type: "hero", props: { variant: "search" } });
    const images = GLO3D_STARTER_PAGES.flatMap((page) =>
      page.blocks.blocks.flatMap((block) => [block.props.mediaUrl, block.props.mediaKey]).filter(Boolean),
    ) as string[];
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) {
      expect(image.startsWith(GLO3D_MEDIA_BASE) || image.startsWith("templates/glo3d/")).toBe(true);
    }
  });

  it("makes no claims a dealer would have to correct (no stats, reviews or addresses)", () => {
    const types = GLO3D_STARTER_PAGES.flatMap((page) => page.blocks.blocks.map((block) => block.type));
    for (const factual of ["trust-stats", "testimonials", "review-summary", "map-hours", "team-grid"]) {
      expect(types).not.toContain(factual);
    }
  });

  it("starts a new Glo3D hero as the inventory search design", () => {
    const hero = templateNewBlockDefaults("glo3d").hero;
    expect(hero).toMatchObject({ variant: "search" });
    expect(validateBlock({ id: "h", type: "hero", props: hero }).ok).toBe(true);
    expect(templateNewBlockDefaults("luxury")).toEqual({});
    expect(templateNewBlockDefaults(null)).toEqual({});
  });
});
