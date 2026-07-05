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

let page: Page;
let tenantSlug = "";

const vehiclesUrl = () => `/admin/${tenantSlug}/vehicles`;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
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
  for (const section of ["Vehicles", "Leads", "Pages", "Team"]) {
    await expect(page.getByRole("link", { name: section, exact: true })).toBeVisible();
  }
  // Fresh signups are not platform admins — no Platform nav entry.
  await expect(page.getByRole("link", { name: "Platform", exact: true })).toHaveCount(0);
});

test("vehicles page shows the empty state for a fresh tenant", async () => {
  await page.goto(vehiclesUrl());
  await expect(page.getByText("No vehicles yet")).toBeVisible();
});

test("CSV import previews and inserts rows", async () => {
  await page.goto(`${vehiclesUrl()}/import`);
  await page.setInputFiles('input[type="file"]', path.join(fixturesDir, "vehicles.csv"));

  await expect(page.getByText("5 valid rows")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Porsche" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Import 5 vehicles" }).click();
  await expect(page.getByText("Imported 5 vehicles.")).toBeVisible();

  await page.getByRole("link", { name: "Back to inventory" }).click();
  await page.waitForURL(`**${vehiclesUrl()}`);
  // Header row + 5 vehicles.
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
