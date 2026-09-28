import type { Page } from "@playwright/test";

/**
 * A fake tenant served from the stub Supabase host (see
 * playwright.layout.config.ts). Only the three anon RPCs the layout reads are
 * answered with data; every other Supabase read gets an empty result, and the
 * admin API gets a 404, so nothing leaves the machine.
 */
export const STUB_SUPABASE = "http://supabase.stub.test";
export const TENANT_NAME = "Riviera Motors";

/** Deliberately long, uneven labels: the realistic worst case for wrapping. */
export const NAV_PAGES = [
  ["home", "Home"],
  ["vehicles", "Inventory"],
  ["contact", "Contact"],
  ["financing", "Financing & Leasing"],
  ["trade-in", "Trade-In"],
  ["service", "Service Centre"],
  ["specials", "Specials"],
  ["about", "About Us"],
  ["certified", "Certified Pre-Owned"],
  ["reviews", "Reviews"],
] as const;

export type StubTheme = {
  header?: Record<string, unknown>;
  footer?: Record<string, unknown>;
  /** Website template, e.g. { key: "glo3d", version: 1 }; defaults to Luxury. */
  template?: { key: string; version: number };
};

/** Templates the layout suites run under. Glo3D never uses the gooey nav. */
export const LAYOUT_TEMPLATES = ["luxury", "glo3d"] as const;
export type LayoutTemplate = (typeof LAYOUT_TEMPLATES)[number];

export function templateTheme(template: LayoutTemplate): Pick<StubTheme, "template"> {
  return template === "luxury" ? {} : { template: { key: template, version: 1 } };
}

/** Test-name suffix: existing Luxury names stay unchanged. */
export function templateLabel(template: LayoutTemplate): string {
  return template === "luxury" ? "" : ` · ${template}`;
}

export async function stubTenant(
  page: Page,
  {
    theme,
    navCount,
    mode,
    pages = NAV_PAGES,
    publishedPages = {},
  }: {
    theme: StubTheme;
    navCount: number;
    mode: "light" | "dark";
    /** Nav order override; defaults to NAV_PAGES. */
    pages?: ReadonlyArray<readonly [string, string]>;
    /** Published page bodies by slug, served by get_published_page. */
    publishedPages?: Record<string, unknown[]>;
  },
): Promise<void> {
  await page.addInitScript((colorMode) => {
    try {
      window.localStorage.setItem("lume.color-theme.v1", colorMode);
      window.localStorage.setItem("lume.color-theme.chosen.v1", "1");
    } catch {
      /* storage unavailable: the app falls back to dark */
    }
  }, mode);

  await page.route(`${STUB_SUPABASE}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/rpc/tenant_by_slug")) {
      return route.fulfill({
        json: [{ id: "00000000-0000-4000-8000-000000000001", slug: "matrix", name: TENANT_NAME, status: "active" }],
      });
    }
    if (path.endsWith("/rpc/get_tenant_theme")) {
      return route.fulfill({
        json: [{ theme: { schemaVersion: 2, template: { key: "luxury", version: 1 }, ...theme } }],
      });
    }
    if (path.endsWith("/rpc/get_published_page")) {
      const slug = String((route.request().postDataJSON() as { p_slug?: string } | null)?.p_slug ?? "");
      const blocks = publishedPages[slug];
      return route.fulfill({
        json: blocks
          ? [{ id: `page-${slug}`, slug, title: slug, seo_meta: {}, published_revision_id: `rev-${slug}`, blocks: { version: 1, blocks } }]
          : [],
      });
    }
    if (path.endsWith("/rpc/list_published_nav_pages")) {
      return route.fulfill({
        json: pages.slice(0, navCount).map(([slug, title], index) => ({ slug, title, nav_order: index })),
      });
    }
    return route.fulfill({ json: [] });
  });
  await page.route("**/api/**", (route) => route.fulfill({ status: 404, json: {} }));
  // Template photos live in production R2; the production smoke test checks
  // the real uploads. Here they are a 1×1 image, like other external assets.
  await page.route(/\/templates\/glo3d\/[a-z0-9-]+\.webp$/, (route) =>
    route.fulfill({ contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64") }),
  );
  // What the public proxy answers for an anonymous visitor (no console error).
  await page.route("**/api/visitor/me*", (route) => route.fulfill({ json: { visitor: null } }));
}

export function navLabels(navCount: number): string[] {
  return NAV_PAGES.slice(0, navCount).map(([, title]) => title.toLowerCase());
}

/** Dismiss the consent banner so it never covers what is being measured. */
export async function dismissConsent(page: Page): Promise<void> {
  const essential = page.getByRole("button", { name: "Essential only" });
  if (await essential.isVisible().catch(() => false)) await essential.click();
}
