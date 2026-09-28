import { expect, test } from "@playwright/test";
import { dismissConsent, NAV_PAGES, stubTenant } from "./stubTenant";

test("keeps pages above the configured header limit in More and on mobile", async ({ page }) => {
  await stubTenant(page, {
    theme: { header: { maxNavItems: 3 } },
    navCount: 6,
    mode: "dark",
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/home");
  await dismissConsent(page);

  const more = page.locator("header").getByRole("button", { name: /^more$/i });
  await expect(more).toBeVisible();
  await more.click();
  const overflow = page.getByRole("group", { name: "More navigation" });
  await expect(overflow).toBeVisible();
  for (const [, title] of NAV_PAGES.slice(3, 6)) {
    await expect(overflow.getByRole("button", { name: title })).toBeVisible();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  const mobileNav = page.getByRole("navigation", { name: "Mobile navigation" });
  for (const [, title] of NAV_PAGES.slice(0, 6)) {
    await expect(mobileNav.getByRole("button", { name: title })).toBeVisible();
  }
});
