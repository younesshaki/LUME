import { expect, test, type Page } from "@playwright/test";
import { dismissConsent, LAYOUT_TEMPLATES, stubTenant, templateLabel, templateTheme, type LayoutTemplate } from "./stubTenant";

/**
 * Block backgrounds (PageBlock.appearance): a colour or photo behind any
 * block, readable in both website modes, never widening the page.
 */

const PHOTO = "https://media.stub.test/tenant-media/showroom.png";
// 2×2 PNG: enough for the browser to decode and lay out.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP4z8DwHwMDAwMDAwMAPfYF+x2tXacAAAAASUVORK5CYII=",
  "base64",
);

const CTA_PROPS = {
  eyebrow: "Next step",
  title: "Talk to our team today.",
  body: "Book a test drive or ask about financing.",
  primaryLabel: "Contact us",
  primaryHref: "/contact",
  secondaryLabel: "View inventory",
  secondaryHref: "/vehicles",
};

const BLOCKS = [
  { id: "plain", type: "cta-banner", props: { ...CTA_PROPS, title: "No background here." } },
  { id: "ink", type: "cta-banner", props: CTA_PROPS, appearance: { backgroundColor: { token: "ink" } } },
  {
    id: "photo",
    type: "feature-band",
    props: { kicker: "Service", heading: "Looked after long after you drive away.", body: "Book a visit whenever it is due.", mediaKey: "", mediaAlt: "" },
    appearance: { backgroundImage: { url: PHOTO, overlayColor: "#000000", overlayOpacity: 55 } },
  },
  {
    id: "band",
    type: "services-list",
    props: { eyebrow: "Services", title: "Everything in one place.", body: "One team from start to finish.", items: [{ label: "Detailing", body: "Inside and out." }] },
    appearance: { backgroundColor: { token: "panel" }, fullWidth: true },
  },
];

async function open(page: Page, template: LayoutTemplate, mode: "light" | "dark") {
  await stubTenant(page, { theme: { ...templateTheme(template) }, navCount: 4, mode, publishedPages: { about: BLOCKS } });
  await page.route(PHOTO, (route) => route.fulfill({ contentType: "image/png", body: PNG }));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/about");
  await dismissConsent(page);
  await expect(page.locator('[data-block-appearance="services-list"]')).toBeVisible();
}

/** Contrast between a block's heading text and the colour painted right behind it. */
function headingContrast(page: Page, frame: string, heading: string, behind: "frame" | "overlay") {
  return page.evaluate(
    ([frameSelector, headingSelector, source]) => {
      // Computed colours arrive as rgb()/rgba() (0–255) or color(srgb …) (0–1).
      const rgb = (value: string) => {
        const channels = (value.match(/\d*\.?\d+/g) ?? []).slice(0, 3).map(Number);
        return value.startsWith("color(") ? channels.map((c) => c * 255) : channels;
      };
      const lum = ([r, g, b]: number[]) => {
        const c = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
      };
      const frameEl = document.querySelector(frameSelector)!;
      const headingEl = frameEl.querySelector(headingSelector)!;
      const text = getComputedStyle(headingEl).color;
      // The text sits on the nearest painted layer: a card inside the block
      // (Glo3D's CTA is its own inverted card), else the block's background.
      const painted = (el: Element) => {
        const bg = getComputedStyle(el).backgroundColor;
        return bg !== "transparent" && !/rgba\([^)]*,\s*0\)$/.test(bg);
      };
      let layer: Element | null = headingEl;
      while (layer && layer !== frameEl && !painted(layer)) layer = layer.parentElement;
      const back =
        layer && layer !== frameEl
          ? getComputedStyle(layer).backgroundColor
          : source === "frame"
            ? getComputedStyle(frameEl).backgroundColor
            : getComputedStyle(frameEl.querySelector(".blockAppearance__overlay")!).backgroundColor;
      const [a, b] = [lum(rgb(text)), lum(rgb(back))].sort((x, y) => y - x);
      return (a + 0.05) / (b + 0.05);
    },
    [frame, heading, behind] as const,
  );
}

for (const template of LAYOUT_TEMPLATES) {
  test.describe(`block backgrounds${templateLabel(template)}`, () => {
    test.beforeEach(({}, testInfo) => {
      test.skip(template === "glo3d" && testInfo.project.name === "gooey-nav", "Glo3D always uses the plain nav");
    });

    for (const mode of ["light", "dark"] as const) {
      test(`an inverted band stays readable in ${mode} mode`, async ({ page }) => {
        await open(page, template, mode);
        const ink = page.locator('[data-block-appearance="cta-banner"]');
        await expect(ink).toHaveCount(1);
        await expect(ink).toHaveAttribute("data-block-tone", mode === "light" ? "dark" : "light");
        expect(await headingContrast(page, '[data-block-appearance="cta-banner"]', "h2", "frame")).toBeGreaterThanOrEqual(4.5);
      });
    }

    test("a photo background loads lazily under a readable overlay", async ({ page }) => {
      await open(page, template, "light");
      const photo = page.locator('[data-block-appearance="feature-band"]');
      await expect(photo.locator(".blockAppearance__media img")).toHaveAttribute("loading", "lazy");
      await expect(photo).toHaveAttribute("data-block-tone", "dark");
      expect(await headingContrast(page, '[data-block-appearance="feature-band"]', "h2", "overlay")).toBeGreaterThanOrEqual(4.5);
    });

    test("blocks without a background render as before, and full width never scrolls sideways", async ({ page }) => {
      await open(page, template, "light");
      await expect(page.locator(".blockAppearance")).toHaveCount(3);
      await expect(page.getByText("No background here.")).toBeVisible();
      const band = page.locator('[data-block-appearance="services-list"]');
      await expect(band).toHaveAttribute("data-full-width", "true");
      const overflow = await page.evaluate(() =>
        [document.scrollingElement, ...document.querySelectorAll("main, main *")]
          .filter((el): el is Element => Boolean(el))
          .filter((el) => /auto|scroll/.test(getComputedStyle(el).overflowX) || el === document.scrollingElement)
          .some((el) => el.scrollWidth > el.clientWidth + 1),
      );
      expect(overflow).toBe(false);
    });
  });
}
