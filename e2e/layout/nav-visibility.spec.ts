import { expect, test, type Page } from "@playwright/test";
import { navPlacements } from "../../packages/types/src/headerNav";
import { dismissConsent, stubTenant } from "./stubTenant";
import defaults from "./fixtures/blockDefaults.json" with { type: "json" };

/**
 * What the admin Pages list says (navPlacements) is what the public site
 * renders: header pages inline, More pages in the More menu, hidden pages in
 * no navigation at all but still reachable by URL.
 */
const PAGES = [
  ["home", "Home"],
  ["vehicles", "Inventory"],
  ["contact", "Contact"],
  ["faq", "FAQ"],
  ["about", "About"],
  ["financing", "Financing"],
] as const;
const HEADER = { maxNavItems: 3, hiddenNavSlugs: ["faq"] };
const expected = navPlacements(
  PAGES.map(([slug, title], navOrder) => ({ slug, title, navOrder })),
  HEADER,
);
const titlesWhere = (placement: string) =>
  PAGES.filter(([slug]) => expected.get(slug) === placement).map(([, title]) => title);

async function open(page: Page, path = "/home") {
  await stubTenant(page, {
    theme: { header: HEADER },
    navCount: PAGES.length,
    mode: "dark",
    pages: PAGES,
    publishedPages: { faq: [{ id: "faq-1", type: "faq-accordion", props: defaults["faq-accordion"] }] },
  });
  await page.goto(path);
  await dismissConsent(page);
  await expect(page.locator("footer")).toContainText("Riviera Motors");
}

const texts = (page: Page, selector: string) =>
  page.locator(selector).evaluateAll((nodes) =>
    nodes.filter((node) => (node as HTMLElement).checkVisibility()).map((node) => (node.textContent ?? "").trim()),
  );

test("the admin's placements are exactly what the desktop header renders", async ({ page }) => {
  expect(titlesWhere("header")).toEqual(["Home", "Inventory", "Contact"]);
  expect(titlesWhere("more")).toEqual(["About", "Financing"]);
  expect(titlesWhere("hidden")).toEqual(["FAQ"]);

  // Wide enough that nothing moves into More for lack of space.
  await page.setViewportSize({ width: 1920, height: 900 });
  await open(page);
  await expect
    .poll(() => texts(page, "header nav[aria-label='Main navigation'] button:not([aria-haspopup])"))
    .toEqual(titlesWhere("header"));
  await page.locator("header").getByRole("button", { name: /^more$/i }).click();
  expect(await texts(page, "[aria-label='More navigation'] button")).toEqual(titlesWhere("more"));
});

test("a hidden page is in no navigation: header, More, footer or phone menu", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await open(page);
  expect(await texts(page, "footer nav button")).not.toContain("FAQ");
  expect(await texts(page, "footer nav button")).toEqual(
    PAGES.filter(([slug]) => expected.get(slug) !== "hidden").map(([, title]) => title),
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  expect(await texts(page, "nav[aria-label='Mobile navigation'] button, nav[aria-label='Mobile navigation'] a")).not.toContain("FAQ");
});

test("a hidden page still opens by its URL", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, "/faq");
  expect(new URL(page.url()).pathname).toBe("/faq");
  await expect(page.locator("main [data-block-type], main section").first()).toBeVisible();
});
