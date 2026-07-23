/**
 * Public smoke for a launch-ready tenant (the demo tenant, real local dev
 * stack — no route mocks): home reachable with tenant identity, inventory
 * reachable, a conversion path visible, and no content leaking across
 * tenant slugs.
 */
import { expect, test } from "@playwright/test";

const TENANT = process.env.LUME_PUBLIC_TEST_TENANT ?? "demo";

test("home is reachable for the tenant", async ({ page }) => {
  const response = await page.goto(`/?tenant=${TENANT}`);
  expect(response?.ok()).toBe(true);
  await expect(page.locator("body")).not.toContainText(/unknown or inactive tenant/i);
});

test("inventory is reachable and shows vehicles", async ({ page }) => {
  const response = await page.goto(`/vehicles?tenant=${TENANT}`);
  expect(response?.ok()).toBe(true);
  await expect(page.locator("body")).toContainText(/\$|vehicle/i);
});

test("a conversion path exists on the contact page", async ({ page }) => {
  const response = await page.goto(`/contact?tenant=${TENANT}`);
  expect(response?.ok()).toBe(true);
  await expect(page.locator("body")).toContainText(/contact|lead|message|call/i);
});

test("an unknown tenant slug does not serve the demo tenant's content", async ({ page }) => {
  await page.goto(`/vehicles?tenant=e2e-no-such-tenant-slug`);
  // The demo lot's real vehicles must not appear under a bogus tenant.
  await expect(page.locator("body")).not.toContainText("Grand Cherokee");
});
