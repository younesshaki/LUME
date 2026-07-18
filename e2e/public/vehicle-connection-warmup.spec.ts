import { expect, test } from "@playwright/test";

test("warms only distinct cross-origin vehicle connections from Home", async ({ page }) => {
  await page.goto("/home?tenant=default&preview=off");

  const hints = await page.locator("link[data-lume-vehicle-preconnect]").evaluateAll((links) =>
    links.map((link) => ({
      href: link.getAttribute("href"),
      crossOrigin: link.getAttribute("crossorigin"),
    })),
  );

  expect(hints.length).toBeGreaterThan(0);
  expect(new Set(hints.map((hint) => hint.href)).size).toBe(hints.length);
  expect(hints.every((hint) => hint.crossOrigin === "anonymous")).toBe(true);
  expect(hints.every((hint) => hint.href !== "http://127.0.0.1:5173")).toBe(true);
});

test("does not add Home vehicle warm-up hints on a direct inventory visit", async ({ page }) => {
  await page.route("**/api/visitor/me", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Unauthorized" }) }),
  );
  await page.route("**/api/vehicles?*", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ vehicles: [], hasMore: false }) }),
  );

  await page.goto("/vehicles?tenant=default&preview=off");
  await expect(page.locator("link[data-lume-vehicle-preconnect]")).toHaveCount(0);
});
