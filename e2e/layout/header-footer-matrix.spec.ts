import { expect, test, type Page } from "@playwright/test";
import {
  dismissConsent,
  LAYOUT_TEMPLATES,
  NAV_PAGES,
  navLabels,
  stubTenant,
  templateLabel,
  templateTheme,
  TENANT_NAME,
} from "./stubTenant";

/**
 * Sprint task A1: the header and footer hold up for every configuration a
 * tenant can pick, at every width a visitor might use.
 *
 * Header: 4 variants × logo left/centre × 1/6/10 nav items × light/dark, each
 * resized through 1920/1440/1024/768/360 px. At every width:
 *  - no horizontal page scroll;
 *  - no two header controls from different slots overlap, and none is cut off
 *    by the viewport or the header's bounds;
 *  - every nav page is reachable (inline, in "More", or in the phone menu);
 *  - a centred logo is actually centred.
 * Footer: 3 variants × light/dark × the same widths.
 */

const WIDTHS = [1920, 1440, 1024, 768, 360] as const;
const HEADER_VARIANTS = ["centred", "left", "split", "minimal"] as const;
const PLACEMENTS = ["left", "centre"] as const;
const NAV_COUNTS = [1, 6, 10] as const;
const MODES = ["dark", "light"] as const;
const FOOTER_VARIANTS = ["columns", "stacked", "minimal"] as const;
const DESKTOP_MIN = 768;

async function noHorizontalScroll(page: Page): Promise<void> {
  const [scrollWidth, innerWidth] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ]);
  expect(scrollWidth, "horizontal page scroll").toBeLessThanOrEqual(innerWidth);
}

type Atom = { slot: string; name: string; left: number; right: number; top: number; bottom: number };

/** Every visible control in the header, tagged with the grid slot it belongs to. */
async function headerAtoms(page: Page): Promise<{ atoms: Atom[]; header: DOMRect; viewport: number }> {
  return page.evaluate(() => {
    const header = document.querySelector("header")!;
    const atoms: Atom[] = [];
    for (const slot of header.querySelectorAll<HTMLElement>("[data-header-slot]")) {
      const slotName = slot.dataset.headerSlot!;
      const controls = slotName === "logo" ? [slot] : [...slot.querySelectorAll<HTMLElement>("button, a")];
      for (const control of controls) {
        const style = getComputedStyle(control);
        const rect = control.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1 || style.visibility === "hidden") continue;
        // Skip controls inside a hidden ancestor (e.g. the desktop nav at phone width).
        if (control.closest("[aria-hidden='true']") || !control.checkVisibility?.()) continue;
        atoms.push({
          slot: slotName,
          name: (control.getAttribute("aria-label") || control.textContent || "").trim().slice(0, 40),
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        });
      }
    }
    return { atoms, header: header.getBoundingClientRect().toJSON(), viewport: window.innerWidth };
  }) as Promise<{ atoms: Atom[]; header: DOMRect; viewport: number }>;
}

function overlaps(a: Atom, b: Atom): boolean {
  // 1px tolerance for subpixel rounding at the shared edge of adjacent tracks.
  return a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
}

async function assertHeaderGeometry(page: Page, context: string): Promise<void> {
  const { atoms, header, viewport } = await headerAtoms(page);
  expect(atoms.length, `${context}: header renders controls`).toBeGreaterThan(0);
  for (const atom of atoms) {
    expect(atom.left, `${context}: "${atom.name}" cut off on the left`).toBeGreaterThanOrEqual(-0.5);
    expect(atom.right, `${context}: "${atom.name}" cut off on the right`).toBeLessThanOrEqual(viewport + 0.5);
    expect(atom.top, `${context}: "${atom.name}" above the header`).toBeGreaterThanOrEqual(header.top - 0.5);
    expect(atom.bottom, `${context}: "${atom.name}" below the header`).toBeLessThanOrEqual(header.bottom + 0.5);
  }
  for (const a of atoms) {
    for (const b of atoms) {
      if (a.slot < b.slot && overlaps(a, b)) {
        throw new Error(`${context}: ${a.slot} "${a.name}" overlaps ${b.slot} "${b.name}"`);
      }
    }
  }
}

/** Nav labels reachable right now: inline + "More" at desktop, the menu on phones. */
async function reachableLabels(page: Page, width: number): Promise<string[]> {
  const read = (selector: string) =>
    page.locator(selector).evaluateAll((nodes) =>
      nodes
        .filter((node) => (node as HTMLElement).checkVisibility?.() ?? true)
        .map((node) => (node.textContent ?? "").trim().toLowerCase()),
    );

  if (width < DESKTOP_MIN) {
    await page.getByRole("button", { name: "Open navigation menu" }).click();
    const labels = await read("nav[aria-label='Mobile navigation'] button, nav[aria-label='Mobile navigation'] a");
    await page.getByRole("button", { name: "Close menu" }).click();
    await expect(page.locator("nav[aria-label='Mobile navigation']")).toHaveCount(0);
    return labels;
  }

  const inline = await read("header nav[aria-label='Main navigation'] button:not([aria-haspopup])");
  const more = page.locator("header").getByRole("button", { name: /^more$/i });
  if (!(await more.isVisible().catch(() => false))) return inline;
  await more.click();
  const panel = page.getByRole("group", { name: "More navigation" });
  await expect(panel).toBeVisible();
  // The panel is a portal: it must also stay inside the viewport.
  const box = (await panel.boundingBox())!;
  expect(box.x, "More panel cut off on the left").toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, "More panel cut off on the right").toBeLessThanOrEqual(width + 0.5);
  const overflow = await read("[aria-label='More navigation'] button");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  return [...inline, ...overflow];
}

async function waitForTenantHeader(page: Page, navCount: number): Promise<void> {
  // The built-in fallback nav renders first; wait until the tenant's own pages
  // (probed via the always-rendered mobile-menu source: the header state) and
  // name have loaded. The footer name is present for every footer variant.
  await expect(page.locator("footer")).toContainText(`${TENANT_NAME}.`);
  const last = NAV_PAGES[navCount - 1][1].toLowerCase();
  await expect
    .poll(async () => {
      const width = page.viewportSize()!.width;
      return (await reachableLabels(page, width)).includes(last);
    })
    .toBe(true);
}

for (const template of LAYOUT_TEMPLATES)
for (const variant of HEADER_VARIANTS) {
  for (const logoPlacement of PLACEMENTS) {
    for (const navCount of NAV_COUNTS) {
      for (const mode of MODES) {
        test(`header ${variant} · logo ${logoPlacement} · ${navCount} items · ${mode}${templateLabel(template)}`, async ({ page }, testInfo) => {
          test.skip(template === "glo3d" && testInfo.project.name === "gooey-nav", "Glo3D always uses the plain nav");
          await stubTenant(page, {
            theme: { ...templateTheme(template), header: { variant, logoPlacement, maxNavItems: 10 } },
            navCount,
            mode,
          });
          await page.setViewportSize({ width: WIDTHS[0], height: 900 });
          await page.goto("/home");
          await dismissConsent(page);
          await waitForTenantHeader(page, navCount);
          await expect(page.locator("header")).toHaveAttribute("data-header-logo-placement", logoPlacement);

          for (const width of WIDTHS) {
            const context = `${width}px`;
            await page.setViewportSize({ width, height: 900 });
            // Let the measured overflow ("More") settle after the resize.
            await page.waitForTimeout(150);
            await noHorizontalScroll(page);
            await assertHeaderGeometry(page, context);
            expect(await reachableLabels(page, width), `${context}: every page reachable`).toEqual(
              expect.arrayContaining(navLabels(navCount)),
            );
            if (logoPlacement === "centre" && width >= DESKTOP_MIN) {
              const box = (await page.locator("[data-header-slot='logo']").boundingBox())!;
              expect(Math.abs(box.x + box.width / 2 - width / 2), `${context}: logo centred`).toBeLessThanOrEqual(2);
            }
          }
        });
      }
    }
  }
}

for (const template of LAYOUT_TEMPLATES)
for (const footerVariant of FOOTER_VARIANTS) {
  for (const mode of MODES) {
    test(`footer ${footerVariant} · ${mode}${templateLabel(template)}`, async ({ page }, testInfo) => {
      test.skip(template === "glo3d" && testInfo.project.name === "gooey-nav", "Glo3D always uses the plain nav");
      await stubTenant(page, {
        theme: {
          ...templateTheme(template),
          header: { maxNavItems: 10 },
          footer: {
            variant: footerVariant,
            columns: 4,
            showSocial: true,
            socialLinks: [
              { label: "Instagram", href: "https://instagram.com/riviera" },
              { label: "YouTube", href: "https://youtube.com/@riviera" },
            ],
            legalLinks: [
              { label: "Privacy", href: "/privacy" },
              { label: "Imprint", href: "/imprint" },
            ],
          },
        },
        navCount: 10,
        mode,
      });
      await page.setViewportSize({ width: WIDTHS[0], height: 900 });
      await page.goto("/home");
      await dismissConsent(page);
      await waitForTenantHeader(page, 10);
      const footer = page.locator("footer");

      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(100);
        await noHorizontalScroll(page);
        const clipped = await footer.evaluate((node) =>
          [...node.querySelectorAll<HTMLElement>("a, button, p, h2, h3, li")]
            .filter((el) => el.checkVisibility?.() ?? true)
            .filter((el) => {
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && (rect.left < -0.5 || rect.right > window.innerWidth + 0.5);
            })
            .map((el) => (el.textContent ?? "").trim().slice(0, 30)),
        );
        expect(clipped, `${width}px: footer content cut off`).toEqual([]);
        await expect(footer).toContainText(`${TENANT_NAME}.`);
        await expect(footer.getByRole("link", { name: "Instagram" })).toBeVisible();
        await expect(footer.getByRole("link", { name: "Imprint" })).toBeVisible();
        // At the very end of the page nothing in the footer may sit under the
        // floating bottom dock (shown from 768px).
        // Pages scroll inside their own container, so scroll the footer itself.
        await footer.evaluate((node) => node.scrollIntoView({ block: "end", behavior: "instant" }));
        const covered = await page.evaluate(() => {
          const dock = document.querySelector(".siteDock__panel");
          const box = dock?.getBoundingClientRect();
          if (!box || box.width === 0 || !(dock as HTMLElement).checkVisibility()) return [];
          return [...document.querySelectorAll<HTMLElement>("footer a, footer button, footer p")]
            .filter((el) => el.checkVisibility())
            .filter((el) => {
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.left < box.right && rect.right > box.left &&
                rect.top < box.bottom && rect.bottom > box.top;
            })
            .map((el) => (el.textContent ?? "").trim().slice(0, 30));
        });
        expect(covered, `${width}px: footer content under the bottom dock`).toEqual([]);
        const footerNav = footer.getByRole("navigation", { name: "Footer navigation" });
        if (footerVariant === "minimal") {
          await expect(footerNav).toHaveCount(0);
        } else {
          for (const [, title] of NAV_PAGES) await expect(footerNav.getByRole("button", { name: title })).toBeVisible();
        }
      }
    });
  }
}

test.describe("More menu", () => {
  test.beforeEach(async ({ page }) => {
    // Built-in screens last, so they land in "More" and are real routes here
    // (custom pages need a page body from Supabase to render locally).
    await stubTenant(page, {
      theme: { header: { variant: "centred", maxNavItems: 10 } },
      navCount: 10,
      mode: "dark",
      pages: [...NAV_PAGES].reverse(),
    });
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto("/home");
    await dismissConsent(page);
    await expect(page.locator("footer")).toContainText(`${TENANT_NAME}.`);
    await expect(more(page)).toBeVisible();
  });

  const more = (page: Page) => page.locator("header").getByRole("button", { name: /^more$/i });
  const panel = (page: Page) => page.getByRole("group", { name: "More navigation" });

  test("opens and closes with the mouse", async ({ page }) => {
    await more(page).click();
    await expect(panel(page)).toBeVisible();
    await expect(more(page)).toHaveAttribute("aria-expanded", "true");
    await more(page).click();
    await expect(panel(page)).toHaveCount(0);
    await more(page).click();
    await page.mouse.click(500, 500);
    await expect(panel(page)).toHaveCount(0);
  });

  test("opens and closes with the keyboard, returning focus to the trigger", async ({ page }) => {
    await more(page).focus();
    await page.keyboard.press("Enter");
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).getByRole("button").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await expect(more(page)).toBeFocused();
  });

  test("picking an item navigates and closes the menu", async ({ page }) => {
    await more(page).click();
    await panel(page).getByRole("button", { name: "Inventory" }).click();
    await expect(page).toHaveURL(/\/vehicles$/);
    await expect(panel(page)).toHaveCount(0);
  });

  test("closes when the route changes by other means (back button)", async ({ page }) => {
    await more(page).click();
    await panel(page).getByRole("button", { name: "Inventory" }).click();
    await expect(page).toHaveURL(/\/vehicles$/);
    await more(page).click();
    await expect(panel(page)).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/home$/);
    await expect(panel(page)).toHaveCount(0);
  });
});
