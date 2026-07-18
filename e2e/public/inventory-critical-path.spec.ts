import { expect, test } from "@playwright/test";

const firstVehicle = {
  id: "22222222-2222-4222-8222-222222222222",
  stockType: "Used",
  year: 2024,
  make: "Porsche",
  model: "911",
  trim: "Carrera",
  price: 125000,
  mileage: 8000,
  bodyStyle: "Coupe",
  exteriorColor: "Black",
  interiorColor: "Black",
  drivetrain: "RWD",
  fuelType: "Gasoline",
  imageSrc: "/e2e-inventory-card.svg",
  sellerCity: "Miami",
  sellerState: "FL",
  isSpecial: false,
};

test("renders initial inventory cards without waiting for counts or facets", async ({ page }) => {
  const inventoryRequests: string[] = [];
  let releaseDeferred: (() => void) | undefined;
  const deferred = new Promise<void>((resolve) => {
    releaseDeferred = resolve;
  });

  await page.route("**/api/visitor/me", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Unauthorized" }) }),
  );
  await page.route("**/api/vehicles/facets?*", async (route) => {
    await deferred;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ makes: [], models: [], states: [], cities: [] }) });
  });
  await page.route("**/api/vehicles?*", async (route) => {
    const requestUrl = new URL(route.request().url());
    inventoryRequests.push(requestUrl.search);
    if (requestUrl.searchParams.get("includeCount") === "true") {
      await deferred;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ vehicles: [], totalCount: 1, hasMore: false }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ vehicles: [firstVehicle], hasMore: false }),
    });
  });
  await page.route("**/e2e-inventory-card.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#171717" /></svg>',
    }),
  );

  await page.goto("/vehicles?tenant=default&preview=off");
  await expect(page.getByRole("heading", { name: "Porsche 911" })).toBeVisible();
  const cardRequests = inventoryRequests.filter(
    (search) => !new URLSearchParams(search).has("includeCount"),
  );
  expect(cardRequests).toHaveLength(1);
  expect(new URLSearchParams(cardRequests[0]).has("includeCount")).toBe(false);

  releaseDeferred?.();
});
