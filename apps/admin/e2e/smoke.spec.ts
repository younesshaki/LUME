/**
 * Admin smoke journey: one throwaway user goes signup → onboarding →
 * provisioned tenant → shell → vehicles (empty → CSV import → search/sort →
 * delete) → leads → platform gate → sign out.
 *
 * Serial by design: every test continues the same signed-in browser page.
 * The user/tenant are created through the real UI and destroyed in global
 * teardown (see support.ts).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { E2E_EMAIL, E2E_PASSWORD_ENV, E2E_SITE_NAME } from "./support";

test.describe.configure({ mode: "serial" });

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

let page: Page;
let tenantSlug = "";

const vehiclesUrl = () => `/admin/${tenantSlug}/vehicles`;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.route("https://images.example.test/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: tinyPng }),
  );
});

test.afterAll(async () => {
  await page.close();
});

test("signup provisions a tenant through onboarding", async () => {
  await page.goto("/signup");
  await page.getByLabel("Business / site name").fill(E2E_SITE_NAME);
  await page.getByLabel("Email").fill(E2E_EMAIL);
  await page.getByLabel("Password").fill(process.env[E2E_PASSWORD_ENV]!);
  await page.getByRole("button", { name: "Create account" }).click();

  await page.waitForURL("**/admin/onboarding");
  // The site name survives the round trip via user_metadata.
  await expect(page.getByLabel("Business / site name")).toHaveValue(E2E_SITE_NAME);
  await page.getByRole("button", { name: "Create my site" }).click();

  // provisionTenant → redirect to the new tenant's overview.
  await page.waitForURL(/\/admin\/(?!onboarding)[^/]+$/, { timeout: 90_000 });
  tenantSlug = new URL(page.url()).pathname.split("/")[2];
  expect(tenantSlug).toBeTruthy();
});

test("admin shell renders sidebar, tenant switcher, and no platform entry", async () => {
  // Tenant switcher shows the provisioned site's name.
  await expect(page.getByRole("button", { name: new RegExp(E2E_SITE_NAME) })).toBeVisible();
  // Core nav sections exist.
  for (const section of ["Website", "Vehicles", "Leads", "Pages", "Team"]) {
    await expect(page.getByRole("link", { name: section, exact: true })).toBeVisible();
  }
  // Fresh signups are not platform admins — no Platform nav entry.
  await expect(page.getByRole("link", { name: "Platform", exact: true })).toHaveCount(0);
});

test("theme reveal stays serialized and clean across 24 consecutive toggles", async () => {
  const root = page.locator("html");
  const toggle = page.getByRole("button", { name: "Toggle theme" });

  for (let index = 0; index < 24; index += 1) {
    const wasDark = await root.evaluate((element) => element.classList.contains("dark"));
    await toggle.click();

    await expect.poll(
      () => root.evaluate((element) => element.classList.contains("dark")),
    ).toBe(!wasDark);
    await expect(page.locator("[data-theme-reveal-overlay]")).toHaveCount(0);
    await expect(toggle).toBeFocused();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("theme")))
      .toBe(wasDark ? "light" : "dark");
  }
});

test("vehicles page shows the empty state for a fresh tenant", async () => {
  await page.goto(vehiclesUrl());
  await expect(page.getByText("No current vehicles yet")).toBeVisible();
});

test("CSV import previews and inserts rows", async () => {
  await page.goto(`${vehiclesUrl()}/import`);
  await page.setInputFiles('input[type="file"]', path.join(fixturesDir, "vehicles.csv"));

  await expect(page.getByText("5 valid rows")).toBeVisible();
  await expect(page.getByText(/1 of 5 rows include a primary photo/)).toBeVisible();
  await expect(page.getByText(/plus 1 additional photo URL detected/)).toBeVisible();
  await expect(page.getByRole("img", { name: "Primary photo for 2021 Porsche 911" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Porsche" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Import 5 vehicles" }).click();
  await expect(page.getByText("Imported 5 vehicles.")).toBeVisible();

  await page.getByRole("link", { name: "Back to inventory" }).click();
  await page.waitForURL(`**${vehiclesUrl()}`);
  // Header row + 5 vehicles.
  await expect(page.getByRole("row")).toHaveCount(6);
});

test("vehicle grid preserves filtering and sorting with selection and feed thumbnails", async () => {
  await page.goto(vehiclesUrl());
  await page.getByRole("link", { name: "Grid", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBe("grid");
  await expect(page.getByRole("link", { name: "Grid", exact: true })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(page.locator('ul[role="list"] > li')).toHaveCount(5);

  const porscheImage = page.getByRole("img", { name: "2021 Porsche 911" });
  await expect(porscheImage).toBeVisible();
  await expect(porscheImage).toHaveAttribute(
    "src",
    "https://images.example.test/e2e-porsche.jpg",
  );

  await page.getByLabel("Select 2021 Porsche 911").check();
  await expect(page.getByText("1 selected on this page")).toBeVisible();

  const search = page.getByPlaceholder(/Search make, model, trim/);
  await search.fill("Porsche");
  await search.press("Enter");
  await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBe("grid");
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("Porsche");
  await expect(page.locator('ul[role="list"] > li')).toHaveCount(1);

  await page.getByLabel("Sort by").selectOption("price");
  await page.getByLabel("Direction").selectOption("asc");
  await page.getByRole("button", { name: "Apply sort" }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("sort")).toBe("price");
  await expect.poll(() => new URL(page.url()).searchParams.get("dir")).toBe("asc");
  await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBe("grid");

  await page.getByPlaceholder(/Search make, model, trim/).fill("");
  await page.getByPlaceholder(/Search make, model, trim/).press("Enter");
  await expect(page.locator('ul[role="list"] > li').first()).toContainText("Honda");

  await page.getByRole("link", { name: "Table", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBeNull();
  await expect(page.getByRole("row")).toHaveCount(6);
});

test("re-import detects duplicates and replace mode swaps inventory", async () => {
  await page.goto(`${vehiclesUrl()}/import`);
  await page.setInputFiles('input[type="file"]', path.join(fixturesDir, "vehicles.csv"));

  // Same file again: every row already exists, so add mode has nothing to do.
  await expect(page.getByText("5 duplicates of current inventory")).toBeVisible();
  await expect(page.getByRole("button", { name: "Import 0 vehicles" })).toBeDisabled();

  // Opting a duplicate back in re-enables the import.
  await page.getByLabel(/Import duplicate 2021 Porsche 911/).check();
  await expect(page.getByRole("button", { name: "Import 1 vehicle" })).toBeEnabled();

  // Replace mode: destructive, so it must go through the confirm dialog.
  await page.getByText("Replace entire inventory", { exact: true }).click();
  await page.getByRole("button", { name: "Replace inventory with 5 vehicles" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Replace entire inventory?");
  await dialog.getByRole("button", { name: "Delete and import" }).click();

  await expect(page.getByText("Replaced 5 vehicles with 5 imported rows.")).toBeVisible();
  await page.getByRole("link", { name: "Back to inventory" }).click();
  await page.waitForURL(`**${vehiclesUrl()}`);
  await expect(page.getByRole("row")).toHaveCount(6);
});

test("search filters and sort orders the inventory", async () => {
  await page.goto(vehiclesUrl());
  const search = page.getByPlaceholder(/Search make, model, trim/);
  await search.fill("Porsche");
  await search.press("Enter");
  await page.waitForURL(/q=Porsche/);
  await expect(page.getByRole("row")).toHaveCount(2);
  await expect(page.getByRole("cell", { name: "Porsche", exact: true })).toBeVisible();

  // First click on Price sorts descending: priciest (Porsche) first.
  await page.goto(vehiclesUrl());
  await page.getByRole("link", { name: "Price" }).click();
  await page.waitForURL(/sort=price/);
  await expect(page.locator("tbody tr").first()).toContainText("Porsche");

  // Second click flips to ascending: cheapest (Civic) first.
  await page.getByRole("link", { name: "Price" }).click();
  await page.waitForURL(/dir=asc/);
  await expect(page.locator("tbody tr").first()).toContainText("Civic");
});

test("delete asks for confirmation and removes the vehicle", async () => {
  await page.goto(vehiclesUrl());
  await page.getByRole("button", { name: "Delete 2019 Honda Civic" }).click();

  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Delete 2019 Honda Civic?");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(page.getByText("Deleted 2019 Honda Civic")).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(5);
  await expect(page.getByRole("cell", { name: "Honda", exact: true })).toHaveCount(0);
});

test("leads page renders its empty state", async () => {
  await page.goto(`/admin/${tenantSlug}/leads`);
  await expect(page.getByText("No leads yet")).toBeVisible();
});

test("website hub lists editable surfaces and the live preview", async () => {
  await page.goto(`/admin/${tenantSlug}/website`);
  await expect(page.getByRole("heading", { name: "Website", exact: true })).toBeVisible();
  // Entry points into every editable surface.
  await expect(page.getByRole("link", { name: /Pages & content/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Header & navigation/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Templates/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Website design/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Logo & favicons/ })).toBeVisible();
  // The true-to-production preview surface.
  await expect(page.getByText("Published website preview")).toBeVisible();
});

test("website design publishes separate dark and light backgrounds", async () => {
  test.skip(
    process.env.LUME_E2E_SITE_DESIGN !== "1" || !process.env.LUME_E2E_PUBLIC_URL,
    "requires staging migrations 066/067 and LUME_E2E_PUBLIC_URL",
  );
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );

  await page.goto(`/admin/${tenantSlug}/templates`);
  await page.getByRole("button", { name: "Use template" }).click();
  await expect(page.getByText(/Nothing changes on the public website/i)).toBeVisible();
  await page.getByRole("button", { name: "Prepare draft" }).click();
  await page.waitForURL(`**/admin/${tenantSlug}/design?source=template`);

  await page.locator('input[type="file"]').setInputFiles({
    name: "website-dark.png",
    mimeType: "image/png",
    buffer: tinyPng,
  });
  await expect(page.getByText(/Dark background uploaded to this draft/i)).toBeVisible();

  await page.getByRole("tab", { name: "Website light mode" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "website-light.png",
    mimeType: "image/png",
    buffer: tinyPng,
  });
  await expect(page.getByText(/Light background uploaded to this draft/i)).toBeVisible();
  await expect(page.getByText("Unpublished changes")).toBeVisible();

  await page.getByRole("button", { name: "Publish website design" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Pages, inventory, navigation, logo, favicons, and domains remain unchanged");
  await dialog.getByRole("button", { name: "Publish website design" }).click();
  await expect(page.getByText("Website design published.")).toBeVisible();

  await page.addInitScript(() => {
    window.sessionStorage.setItem("lume.gate-passed.v1", "1");
    window.localStorage.setItem("lume.color-theme.v1", "dark");
  });
  const publicUrl = process.env.LUME_E2E_PUBLIC_URL!.replace(/\/+$/, "");
  await page.goto(`${publicUrl}/home?tenant=${encodeURIComponent(tenantSlug)}`);
  await expect.poll(() => page.locator("html").evaluate((element) =>
    getComputedStyle(element).getPropertyValue("--theme-site-background-image"),
  )).toContain("siteBackground-");
  const darkBackground = await page.locator("html").evaluate((element) =>
    getComputedStyle(element).getPropertyValue("--theme-site-background-image"),
  );
  await page.getByRole("button", { name: /Switch website color theme to light/i }).click();
  await expect.poll(() => page.locator("html").evaluate((element) =>
    getComputedStyle(element).getPropertyValue("--theme-site-background-image"),
  )).not.toBe(darkBackground);
});

test("navigation settings page previews the published header nav", async () => {
  await page.goto(`/admin/${tenantSlug}/navigation`);
  await expect(page.getByText("Header settings")).toBeVisible();
  // Provisioned starter pages are published, so the preview lists them.
  await expect(page.getByText("Header preview")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeEnabled();

  // Lower the cap and save; the preview reflects it immediately.
  await page.getByLabel("Pages shown in the header").fill("2");
  await expect(page.getByText(/2 pages in the header/)).toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Navigation settings saved")).toBeVisible();
});

test("analytics page renders the chart suite", async () => {
  await page.goto(`/admin/${tenantSlug}/analytics`);
  for (const title of [
    "Leads over time",
    "Inventory by make",
    "Inventory by body style",
    "Price distribution",
  ]) {
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  }
  // The inventory charts should actually plot the remaining 4 vehicles.
  await expect(page.locator(".recharts-surface").first()).toBeVisible();
  // Park the pointer so no chart tooltip pollutes the screenshot.
  await page.mouse.move(0, 0);
  await page.screenshot({ path: "test-results/analytics.png", fullPage: true });
});

test("platform page 404s for non-platform-admins", async () => {
  const response = await page.goto("/admin/platform");
  expect(response?.status()).toBe(404);
});

test("sign out returns to login and re-locks /admin", async () => {
  await page.goto(`/admin/${tenantSlug}`);
  await page.getByRole("button", { name: new RegExp(E2E_EMAIL) }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL("**/login**");

  // The middleware gate is back in force.
  await page.goto("/admin");
  await page.waitForURL(/\/login\?next=/);
});
