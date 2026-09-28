import { expect, test, type Page } from "@playwright/test";
import { stubTenant } from "./stubTenant";
// Editor defaults for these block types (from @lume/blocks), so every block
// validates and renders exactly as a freshly added block would.
import defaults from "./fixtures/blockDefaults.json" with { type: "json" };

/**
 * Sprint task A4: public pages load with zero console errors and zero failed
 * requests. A production sweep of every demo page (2026-09-28) found: a 401
 * for the anonymous visitor check on every page, a 404 for the vehicle price
 * signal on every vehicle page, an aborted LUME-logo download on most dealer
 * pages, and chat failing to load after a deploy. Each is fixed; this keeps
 * them fixed, for the hand-built pages and the page-builder ones.
 */

const VEHICLE = {
  id: "98888c4f-f7ee-4ece-9d26-febefb66a12d", stockType: "Used", year: 2023, make: "Lamborghini",
  model: "Urus", trim: "Performante", price: 555500, mileage: 5123, bodyStyle: "SUV",
  exteriorColor: "Verde Viper", interiorColor: "Nero", drivetrain: "AWD", fuelType: "Gasoline",
  imageSrc: "", sellerCity: "Costa Mesa", sellerState: "CA", isSpecial: false,
};

// Block types the demo tenant's pages use, with their editor defaults.
const block = (id: string, type: keyof typeof defaults) => ({ id, type, props: defaults[type] });
const CUSTOM_PAGES: Record<string, unknown[]> = {
  financing: [block("f-hero", "hero"), block("f-calc", "finance-calculator"), block("f-stats", "trust-stats")],
  faq: [block("q-faq", "faq-accordion"), block("q-cta", "cta-banner")],
  about: [block("a-text", "rich-text"), block("a-team", "team-grid"), block("a-quotes", "testimonials")],
};

type Problems = string[];

async function watch(page: Page): Promise<Problems> {
  const problems: Problems = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text()} (${message.location().url})`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => {
    // Media the browser cancels on navigation is not a failure.
    if (request.failure()?.errorText === "net::ERR_ABORTED" && request.resourceType() === "media") return;
    problems.push(`failed: ${request.failure()?.errorText} ${request.url()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) problems.push(`http ${response.status()}: ${response.url()}`);
  });
  return problems;
}

async function stub(page: Page) {
  await stubTenant(page, {
    theme: { header: { maxNavItems: 10 } },
    navCount: 6,
    mode: "dark",
    publishedPages: CUSTOM_PAGES,
    pages: [
      ["home", "Home"], ["vehicles", "Inventory"], ["contact", "Contact"],
      ["financing", "Financing"], ["faq", "FAQ"], ["about", "About"],
    ],
  });
  await page.route("**/api/vehicles/facets*", (route) =>
    route.fulfill({ json: { makes: ["Lamborghini"], models: ["Urus"], states: ["CA"], cities: ["Costa Mesa"] } }),
  );
  await page.route("**/api/vehicles?**", (route) =>
    route.fulfill({ json: { vehicles: [VEHICLE], totalCount: 1, hasMore: false } }),
  );
  await page.route(`**/api/vehicles/${VEHICLE.id}?**`, (route) =>
    route.fulfill({ json: { vehicle: VEHICLE, images: [], priceSignal: { enabled: false, reductions: 0 } } }),
  );
  await page.route("**/api/events*", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/consent*", (route) => route.fulfill({ status: 204, body: "" }));
}

for (const preview of [false, true]) {
  const query = preview ? "?preview=lume" : "";
  for (const [path, ready] of [
    ["/home", "header"],
    ["/vehicles", "text=Urus >> visible=true"],
    [`/vehicles/${VEHICLE.id}`, "h1:has-text('Urus')"],
    ["/contact", "header"],
    ["/financing", "h1:has-text('Financing')"],
    ["/faq", "header"],
    ["/about", "text=About us. >> visible=true"],
  ] as const) {
    test(`${path}${preview ? " (page builder)" : ""} is console-clean`, async ({ page }) => {
      await stub(page);
      const problems = await watch(page);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${path}${query}`);
      await expect(page.locator(ready).first()).toBeVisible();
      // Scroll so lazy blocks and images load, then let requests settle.
      await page.mouse.wheel(0, 4000);
      await page.waitForTimeout(1500);
      expect(new URL(page.url()).pathname).toBe(path);
      expect(problems).toEqual([]);
    });
  }
}
