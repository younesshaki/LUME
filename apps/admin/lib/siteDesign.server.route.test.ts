import { describe, expect, it, vi } from "vitest";
import { createDefaultSiteDesign, getSiteTemplate, type SiteDesign, type TenantFooterConfig } from "@lume/types";

vi.mock("server-only", () => ({}));

const { serializeSiteDesignDraft } = await import("./siteDesign.server");

describe("serializeSiteDesignDraft", () => {
  it("keeps footer configuration in a durable working draft", () => {
    const design: SiteDesign & { footer?: TenantFooterConfig } = {
      ...createDefaultSiteDesign(getSiteTemplate("luxury")),
      footer: { variant: "columns" as const, columns: 4, showSocial: false },
    };

    expect(serializeSiteDesignDraft(design)).toMatchObject({
      footer: { variant: "columns", columns: 4, showSocial: false },
    });
  });
});
