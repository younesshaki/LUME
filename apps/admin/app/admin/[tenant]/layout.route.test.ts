import { beforeEach, describe, expect, it, vi } from "vitest";

const themes = new Map<string, unknown>();
const queriedSlugs: string[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: (table: string) => {
      expect(table).toBe("tenants");
      return {
        select: () => ({
          eq: (_column: string, slug: string) => ({
            maybeSingle: async () => {
              queriedSlugs.push(slug);
              return { data: themes.has(slug) ? { theme: themes.get(slug) } : null, error: null };
            },
          }),
        }),
      };
    },
  }),
}));

import { generateMetadata } from "./layout";

const FAVICON = "https://atsgdjwjtmqvtotbrowu.supabase.co/storage/v1/object/public/tenant-logos/t1/branding";

describe("tenant admin layout metadata", () => {
  beforeEach(() => {
    themes.clear();
    queriedSlugs.length = 0;
  });

  it("gives a branded tenant its own favicons", async () => {
    themes.set("demo-arash", {
      branding: { favicon32Url: `${FAVICON}/favicon-32?v=1`, favicon192Url: `${FAVICON}/favicon-192?v=1` },
    });
    const metadata = await generateMetadata({ params: Promise.resolve({ tenant: "demo-arash" }) });
    expect(queriedSlugs).toEqual(["demo-arash"]);
    expect(metadata.icons).toEqual({
      icon: [
        { url: `${FAVICON}/favicon-32?v=1`, sizes: "32x32", type: "image/png" },
        { url: `${FAVICON}/favicon-192?v=1`, sizes: "192x192", type: "image/png" },
      ],
    });
  });

  it("leaves an unbranded tenant on the admin default", async () => {
    themes.set("plain", { branding: { logoUrl: `${FAVICON}/logo` } });
    expect(await generateMetadata({ params: Promise.resolve({ tenant: "plain" }) })).toEqual({});
  });

  it("falls back for a tenant the user cannot read", async () => {
    expect(await generateMetadata({ params: Promise.resolve({ tenant: "someone-else" }) })).toEqual({});
  });

  it("ignores a favicon that is not an https URL", async () => {
    themes.set("odd", { branding: { favicon32Url: "javascript:alert(1)", favicon192Url: "http://example.com/i.png" } });
    expect(await generateMetadata({ params: Promise.resolve({ tenant: "odd" }) })).toEqual({});
  });
});
