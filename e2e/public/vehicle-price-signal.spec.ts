import { expect, test } from "@playwright/test";

/**
 * The price-reduction badge comes from the vehicle-detail response itself.
 * It used to be a second request to /api/vehicles/:id/price-signal, a route
 * that only exists on the admin app: on production every vehicle page logged
 * a 404 and the badge never showed (found 2026-09-27).
 */
const vehicleId = "11111111-1111-4111-8111-111111111111";

test("shows the price-reduction badge from the detail response, with no /price-signal request", async ({ page }) => {
  const signalRequests: string[] = [];
  let detailRequests = 0;
  await page.addInitScript(() => {
    window.sessionStorage.setItem("lume.gate-passed.v1", "1");
  });
  page.on("request", (request) => {
    if (request.url().includes("/price-signal")) signalRequests.push(request.url());
  });
  await page.route(`**/api/vehicles/${vehicleId}?**`, async (route) => {
    detailRequests += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        vehicle: {
          id: vehicleId, stockType: "Used", year: 2022, make: "BMW", model: "X5", trim: "xDrive40i",
          price: 58000, mileage: 12000, bodyStyle: "SUV", exteriorColor: "Black", interiorColor: "Tan",
          drivetrain: "AWD", fuelType: "Gasoline", imageSrc: "/vehicles/fallback.webp",
          sellerCity: "Denver", sellerState: "CO", isSpecial: false,
        },
        images: [],
        priceSignal: { enabled: true, reductions: 2 },
      }),
    });
  });
  await page.route("**/api/vehicles/*/price-signal*", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: "{}" }),
  );
  await page.route("**/api/visitor/me", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: "{}" }),
  );

  await page.goto(`/vehicles/${vehicleId}`);
  await expect(page.getByText("Price reduced 2 times in the last 30 days")).toBeVisible();
  expect(signalRequests).toEqual([]);
  expect(detailRequests).toBe(1);
});
