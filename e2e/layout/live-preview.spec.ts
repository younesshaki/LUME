import { expect, test, type Page } from "@playwright/test";
import { stubTenant } from "./stubTenant";

/**
 * Sprint task A3: the admin editor's live preview (`/__preview` in an iframe,
 * fed over postMessage — see packages/blocks/src/previewProtocol.ts) shows
 * what the live site will show, updates without reloading, and stays
 * console-clean.
 *
 * Until 2026-09-28 the preview route rendered with none of the live site's
 * providers: the tenant's theme was never applied, and the showcase gallery
 * and vehicle detail blocks (both used by the demo tenant) rendered nothing.
 */

const SAMPLE_VEHICLE = {
  id: "98888c4f-f7ee-4ece-9d26-febefb66a12d", stockType: "Used", year: 2023, make: "Lamborghini",
  model: "Urus", trim: "Performante", price: 555500, mileage: 5123, bodyStyle: "SUV",
  exteriorColor: "Verde Viper", interiorColor: "Nero", drivetrain: "AWD", fuelType: "Gasoline",
  imageSrc: "", sellerCity: "Costa Mesa", sellerState: "CA", isSpecial: false,
};
const TENANT_BACKGROUND = "#123456";

type Harness = { send: (blocks: unknown[]) => Promise<void>; messages: () => Promise<unknown[]>; errors: string[] };

async function openEditor(page: Page, baseURL: string): Promise<Harness> {
  await stubTenant(page, {
    theme: { modes: { dark: { colors: { background: TENANT_BACKGROUND } } } } as never,
    navCount: 3,
    mode: "dark",
  });
  await page.route("**/api/vehicles?**", (route) =>
    route.fulfill({ json: { vehicles: [SAMPLE_VEHICLE], totalCount: 1, hasMore: false } }),
  );
  await page.route(`**/api/vehicles/${SAMPLE_VEHICLE.id}?**`, (route) =>
    route.fulfill({ json: { vehicle: SAMPLE_VEHICLE, images: [], priceSignal: { enabled: false, reductions: 0 } } }),
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${message.text()} ${message.location().url}`);
  });
  // A stand-in for the admin editor: it embeds the preview and records what
  // the preview posts back. Served from the preview's origin because Chrome's
  // private-network rules block a public origin from framing loopback.
  await page.route(`${baseURL}/__editor-host`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><body style="margin:0">
        <iframe id="preview" src="${baseURL}/__preview?tenant=matrix&preview=lume" style="width:1280px;height:900px;border:0"></iframe>
        <script>window.received=[];addEventListener("message",(e)=>window.received.push(e.data));</script>
      </body>`,
    }),
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${baseURL}/__editor-host`);
  const messages = () => page.evaluate(() => (window as unknown as { received: unknown[] }).received);
  await expect.poll(async () => (await messages()).some((m) => (m as { type?: string })?.type === "ready")).toBe(true);
  const send = (blocks: unknown[]) =>
    page.evaluate((payload) => {
      (document.getElementById("preview") as HTMLIFrameElement).contentWindow!.postMessage(
        { channel: "lume-preview", type: "update", doc: { slug: "home", title: "Home", blocks: payload } },
        "*",
      );
    }, blocks);
  return { send, messages, errors };
}

const preview = (page: Page) => page.frameLocator("#preview");
const previewFrame = (page: Page) => page.frames().find((frame) => frame.url().includes("/__preview"))!;

test("edits stream into the preview without a reload", async ({ page, baseURL }) => {
  const { send, errors } = await openEditor(page, baseURL!);
  await send([{ id: "hero-1", type: "hero", props: { title: "First title", subtitle: "Sub" } }]);
  await expect(preview(page).getByRole("heading", { name: "First title" })).toBeVisible();

  // Mark the frame's document; a reload would lose it.
  await previewFrame(page).evaluate(() => ((window as unknown as { marker: number }).marker = 42));
  await send([{ id: "hero-1", type: "hero", props: { title: "Edited title", subtitle: "Sub", eyebrow: "New eyebrow" } }]);
  await expect(preview(page).getByRole("heading", { name: "Edited title" })).toBeVisible();
  await expect(preview(page).getByText("New eyebrow")).toBeVisible();
  expect(await previewFrame(page).evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(42);
  expect(errors).toEqual([]);
});

test("the preview wears the tenant's theme, like the live site", async ({ page, baseURL }) => {
  const { send } = await openEditor(page, baseURL!);
  await send([{ id: "hero-1", type: "hero", props: { title: "Themed" } }]);
  await expect(preview(page).getByRole("heading", { name: "Themed" })).toBeVisible();
  await expect
    .poll(() =>
      previewFrame(page).evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--theme-lume-background").trim(),
      ),
    )
    .toBe(TENANT_BACKGROUND);
  expect(await previewFrame(page).evaluate(() => document.documentElement.dataset.lumeTemplate)).toBe("luxury");
});

test("showcase gallery and vehicle detail render in the preview", async ({ page, baseURL }) => {
  const { send, errors } = await openEditor(page, baseURL!);
  await send([{ id: "gallery-1", type: "showcase-gallery", props: {} }]);
  await expect(preview(page).locator("[data-lume-preview-block='gallery-1']")).not.toBeEmpty();
  await expect(preview(page).getByRole("button", { name: /open/i }).first()).toBeVisible();

  // No /vehicles/:id route in the preview: the block shows a real sample car,
  // so editing its eyebrow is visible.
  await send([{ id: "vehicle-1", type: "vehicle-detail", props: { eyebrow: "The Collection" } }]);
  await expect(preview(page).getByRole("heading", { name: /Lamborghini Urus/i })).toBeVisible();
  await expect(preview(page).getByText("The Collection")).toBeVisible();
  await send([{ id: "vehicle-1", type: "vehicle-detail", props: { eyebrow: "Hand-picked" } }]);
  await expect(preview(page).getByText("Hand-picked")).toBeVisible();
  expect(errors).toEqual([]);
});

test("clicking a block selects it in the editor instead of following links", async ({ page, baseURL }) => {
  const { send, messages } = await openEditor(page, baseURL!);
  await send([
    { id: "hero-1", type: "hero", props: { title: "Click me", primaryCtaLabel: "Go", primaryCtaHref: "/contact" } },
  ]);
  await preview(page).getByRole("link", { name: "Go" }).click();
  await expect
    .poll(async () => (await messages()).some((m) => (m as { type?: string; blockId?: string }).blockId === "hero-1"))
    .toBe(true);
  expect(previewFrame(page).url()).toContain("/__preview");
});
