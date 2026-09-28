import { expect, test, type Page } from "@playwright/test";
import { stubTenant, templateTheme } from "./stubTenant";

/**
 * A template can set the colour mode a first-time visitor sees (Glo3D: light);
 * the visitor's own toggle choice always wins.
 */
async function firstVisit(page: Page, template: "luxury" | "glo3d", stored: Record<string, string> = {}) {
  await stubTenant(page, { theme: { ...templateTheme(template) }, navCount: 4, mode: "dark" });
  // Runs after stubTenant's seed: start from the given storage instead.
  await page.addInitScript((values) => {
    for (const key of ["lume.color-theme.v1", "lume.color-theme.chosen.v1", "lume.color-theme.site-default.v1"]) {
      window.localStorage.removeItem(key);
    }
    for (const [key, value] of Object.entries(values)) window.localStorage.setItem(key, value);
  }, stored);
  await page.goto("/home");
  await expect(page.locator("header").first()).toBeVisible();
}

const theme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme);

test("Glo3D opens in light mode for a first-time visitor", async ({ page }) => {
  await firstVisit(page, "glo3d");
  await expect.poll(() => theme(page)).toBe("light");
  // Remembered for the next page load's first paint, without counting as a choice.
  expect(await page.evaluate(() => localStorage.getItem("lume.color-theme.site-default.v1"))).toBe("light");
  expect(await page.evaluate(() => localStorage.getItem("lume.color-theme.chosen.v1"))).toBeNull();
});

test("Glo3D replaces a dark mode the visitor never chose", async ({ page }) => {
  await firstVisit(page, "glo3d", { "lume.color-theme.v1": "dark" });
  await expect.poll(() => theme(page)).toBe("light");
});

test("Glo3D keeps a dark mode the visitor chose", async ({ page }) => {
  await firstVisit(page, "glo3d", { "lume.color-theme.v1": "dark", "lume.color-theme.chosen.v1": "1" });
  await page.waitForTimeout(1000);
  expect(await theme(page)).toBe("dark");
});

test("Luxury still opens in dark mode", async ({ page }) => {
  await firstVisit(page, "luxury", { "lume.color-theme.site-default.v1": "light" });
  await expect.poll(() => theme(page)).toBe("dark");
});
