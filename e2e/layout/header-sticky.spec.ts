import { expect, test, type Page } from "@playwright/test";
import { dismissConsent, LAYOUT_TEMPLATES, stubTenant, templateLabel, templateTheme } from "./stubTenant";

/**
 * Navigation → "Keep the header pinned while scrolling" (theme.header.sticky).
 * Pages scroll inside their own container, not the document, so the header
 * used to stay on screen whether or not the setting was on.
 */
async function openAndScroll(
  page: Page,
  sticky: boolean,
  template: (typeof LAYOUT_TEMPLATES)[number],
  { scrollBeforeSettingsLoad = false } = {},
) {
  await stubTenant(page, {
    theme: { ...templateTheme(template), header: { maxNavItems: 6, sticky } },
    navCount: 4,
    mode: "light",
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/home");
  await dismissConsent(page);
  await expect(page.locator("header").first()).toBeVisible();
  const settingApplied = () =>
    expect(page.locator("header").first()).toHaveAttribute("data-header-sticky", sticky ? "true" : "false");
  if (!scrollBeforeSettingsLoad) await settingApplied();
  // Scroll whichever element actually scrolls the page, once the page has
  // rendered enough content to scroll.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scroller = [...document.querySelectorAll<HTMLElement>("*")].find(
          (el) => el.scrollHeight > el.clientHeight + 400 && /auto|scroll/.test(getComputedStyle(el).overflowY),
        );
        scroller?.scrollTo({ top: 1200, behavior: "instant" });
        return scroller?.scrollTop ?? 0;
      }),
    )
    .toBeGreaterThan(400);
  await settingApplied();
  await page.waitForTimeout(200);
}

/** How much of the header is still inside the viewport, in px. */
const visibleHeight = (page: Page) =>
  page.locator("header").first().evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
  });

for (const template of LAYOUT_TEMPLATES) {
  test(`pinned header stays on screen while scrolling${templateLabel(template)}`, async ({ page }, testInfo) => {
    test.skip(template === "glo3d" && testInfo.project.name === "gooey-nav", "Glo3D always uses the plain nav");
    await openAndScroll(page, true, template);
    expect(await visibleHeight(page)).toBeGreaterThan(40);
  });

  test(`unpinned header scrolls away with the page${templateLabel(template)}`, async ({ page }, testInfo) => {
    test.skip(template === "glo3d" && testInfo.project.name === "gooey-nav", "Glo3D always uses the plain nav");
    await openAndScroll(page, false, template);
    expect(await visibleHeight(page)).toBe(0);
  });

  test(`unpinned header is hidden even if the setting loads after scrolling${templateLabel(template)}`, async ({ page }, testInfo) => {
    test.skip(template === "glo3d" && testInfo.project.name === "gooey-nav", "Glo3D always uses the plain nav");
    await page.route("**/rpc/get_tenant_theme", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fallback();
    });
    await openAndScroll(page, false, template, { scrollBeforeSettingsLoad: true });
    await expect.poll(() => visibleHeight(page)).toBe(0);
  });
}
