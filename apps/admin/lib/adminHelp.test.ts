import { describe, expect, it } from "vitest";
import { ADMIN_HELP_ARTICLES, searchAdminHelp } from "./adminHelp";

describe("curated admin help", () => {
  it("returns versioned product help without tenant data", () => {
    expect(searchAdminHelp("How do I upload a CSV?")[0]).toMatchObject({
      id: "inventory-import",
      capabilityId: "vehicles.import",
    });
  });

  it("keeps every destination in the closed capability registry", async () => {
    const { capabilityById } = await import("./adminConcierge");
    for (const article of ADMIN_HELP_ARTICLES) {
      expect(capabilityById(article.capabilityId), article.id).not.toBeNull();
    }
  });

  it("returns no fabricated answer for an unknown topic", () => {
    expect(searchAdminHelp("quantum flux capacitor calibration")).toEqual([]);
  });
});
