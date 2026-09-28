import { expect, test, type Page } from "@playwright/test";

/**
 * The header always tells the visitor where they are — and never lies.
 *
 * Run against both nav styles (see playwright.header.config.ts). Bugs these
 * pin, all confirmed on the live demo tenant on 2026-09-26:
 *  - a published page outside the nav (/financing) marked "Home" as current
 *    (unit-tested in activeNav.test.ts; here via /account, a real non-nav route);
 *  - at phone width the gooey desktop nav rendered in the header, hiding the
 *    menu button, with the active label bleeding through behind "More";
 *  - at phone width the media-quality gear sat on top of the menu button and
 *    swallowed the tap, so the menu could not be opened.
 */

const VEHICLE_ID = "2ae764bd-8de1-4866-86d7-e48fa3cb2b93";
let escapedRequests: string[] = [];

async function stubBackend(page: Page): Promise<void> {
  await page.route("**/api/**", (route) => {
    escapedRequests.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    return route.fulfill({ status: 599, contentType: "application/json", body: "{}" });
  });
  await page.route("**/api/visitor/me", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: "{}" }),
  );
  await page.route("**/api/vehicles/facets*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ makes: [], models: [], states: [], cities: [] }),
    }),
  );
  await page.route("**/api/vehicles*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ vehicles: [], totalCount: 0, hasMore: false }),
    }),
  );
  await page.route("**/api/vehicles/*", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: "{}" }),
  );
  await page.route("**/api/vehicles/*/price-signal*", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ enabled: false }) }),
  );
  await page.route("**/api/events*", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/consent*", (route) => route.fulfill({ status: 204, body: "" }));
}

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  const consent = page.getByRole("button", { name: "Accept analytics" });
  if (await consent.isVisible().catch(() => false)) await consent.click();
  await expect(page.locator("header").first()).toBeVisible();
}

/** Labels marked as the current page inside the header (desktop nav). */
async function currentInHeader(page: Page): Promise<string[]> {
  return page
    .locator("header nav [aria-current='page']")
    .evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? "").trim().toLowerCase()));
}

test.beforeEach(async ({ page }) => {
  escapedRequests = [];
  await stubBackend(page);
});

test.afterEach(() => {
  expect(escapedRequests, "unstubbed /api requests").toEqual([]);
});

test.describe("desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const [path, expected] of [
    ["/home", "home"],
    ["/vehicles", "vehicles"],
    ["/vehicles#vehicles?make=Porsche&sort=price_desc", "vehicles"],
    [`/vehicles/${VEHICLE_ID}`, "vehicles"],
    ["/products", "products"],
    ["/contact", "contact"],
  ] as const) {
    test(`${path} marks exactly "${expected}"`, async ({ page }) => {
      await open(page, path);
      await expect.poll(() => currentInHeader(page)).toEqual([expected]);
    });
  }

  test("a page outside the nav marks nothing — never Home", async ({ page }) => {
    // /account is a real route that is not a nav item. (Custom published
    // pages such as /financing need Supabase to render, so the /financing →
    // "Home" production bug is pinned in nav/activeNav.test.ts instead.)
    await open(page, "/account");
    expect(new URL(page.url()).pathname).toBe("/account");
    // Give any late nav data a chance to (wrongly) mark something.
    await page.waitForTimeout(500);
    expect(await currentInHeader(page)).toEqual([]);
  });

  test("the current item is visibly distinct from the others", async ({ page }) => {
    await open(page, "/vehicles");
    await expect.poll(() => currentInHeader(page)).toEqual(["vehicles"]);
    const [active, inactive] = await Promise.all([
      page.locator("header nav [aria-current='page']").first().evaluate((node) => {
        const style = getComputedStyle(node);
        return { color: style.color, weight: style.fontWeight };
      }),
      page.locator("header nav button:not([aria-current])").first().evaluate((node) => {
        const style = getComputedStyle(node);
        return { color: style.color, weight: style.fontWeight };
      }),
    ]);
    expect(active).not.toEqual(inactive);
  });

  test("a concierge-driven navigation moves the marker", async ({ page }) => {
    await page.route("**/api/chat", (route) =>
      route.fulfill({
        contentType: "text/event-stream",
        body: [
          { type: "meta", sourceCategories: [], sessionId: "s1", requestId: "r1" },
          { type: "action", action: { type: "filter_inventory", make: "Porsche" } },
          { choices: [{ delta: { content: "Here are the Porsches." } }] },
        ]
          .map((event) => `data: ${JSON.stringify(event)}\n\n`)
          .join("") + "data: [DONE]\n\n",
      }),
    );
    await open(page, "/home");
    await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" });
    await page.getByRole("button", { name: "Open LUME assistant" }).click();
    await page.getByRole("textbox", { name: "Message LUME assistant" }).fill("any Porsches?");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page).toHaveURL(/\/vehicles/);
    await expect.poll(() => currentInHeader(page)).toEqual(["vehicles"]);
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the menu button is reachable and no desktop nav leaks into the header", async ({ page }) => {
    await open(page, "/vehicles");
    const menuButton = page.getByRole("button", { name: "Open navigation menu" });
    await expect(menuButton).toBeVisible();
    await expect(menuButton).toBeInViewport();
    // Neither desktop nav (nor its "More" trigger) is visible at phone width.
    await expect(page.locator("header nav[aria-label='Main navigation']")).toBeHidden();
    await expect(page.locator("header").getByRole("button", { name: /^more$/i })).toBeHidden();
  });

  test("the open menu marks the current page, with a visible marker", async ({ page }) => {
    await open(page, `/vehicles/${VEHICLE_ID}`);
    await page.getByRole("button", { name: "Open navigation menu" }).click();
    const current = page.locator("nav[aria-label='Mobile navigation'] [aria-current='page']");
    await expect(current).toHaveCount(1);
    await expect(current).toHaveText(/vehicles/i);
    const marker = await current.evaluate(
      (node) => getComputedStyle(node, "::before").backgroundColor,
    );
    expect(marker).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("the open menu sits above the floating gear and chat launcher", async ({ page }) => {
    await open(page, "/vehicles");
    const gear = page.locator(".mediaQualitySettings__trigger");
    const launcher = page.getByRole("button", { name: "Open LUME assistant" });
    await expect(gear).toBeVisible();
    await expect(launcher).toBeVisible();
    const points = await Promise.all(
      [gear, launcher].map(async (locator) => {
        const box = (await locator.boundingBox())!;
        return [box.x + box.width / 2, box.y + box.height / 2] as const;
      }),
    );

    await page.getByRole("button", { name: "Open navigation menu" }).click();
    await expect(page.getByRole("button", { name: "Close menu" })).toBeVisible();
    // Exactly one close control: the sheet's default corner ✕ is suppressed.
    await expect(page.getByRole("button", { name: /^close$/i })).toHaveCount(0);

    // What is actually on top where the gear and launcher float must belong
    // to the open menu panel.
    const onTop = await page.evaluate((probes) => {
      const panel = document
        .querySelector("nav[aria-label='Mobile navigation']")
        ?.closest("[role='dialog']");
      return probes.map(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        const label = hit ? `${hit.tagName}.${String(hit.getAttribute("class") ?? "").slice(0, 40)}` : "nothing";
        return `${Boolean(panel && hit && panel.contains(hit))} ${label}`;
      });
    }, points);
    expect(onTop.join(" || ")).not.toMatch(/(^|\|\| )false /);
  });

  test("a page outside the nav marks nothing in the menu", async ({ page }) => {
    await open(page, "/account");
    await page.getByRole("button", { name: "Open navigation menu" }).click();
    await expect(page.locator("nav[aria-label='Mobile navigation']")).toBeVisible();
    await expect(page.locator("nav[aria-label='Mobile navigation'] [aria-current='page']")).toHaveCount(0);
  });
});
