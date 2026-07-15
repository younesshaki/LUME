import { expect, test } from "@playwright/test";

const vehicleId = "11111111-1111-4111-8111-111111111111";

async function prepareVehicle(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("lume.gate-passed.v1", "1");
  });
  await page.route(`**/api/vehicles/${vehicleId}?**`, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        vehicle: {
          id: vehicleId,
          stockType: "Used",
          year: 2024,
          make: "Ferrari",
          model: "Roma",
          trim: "Coupe",
          price: 285000,
          mileage: 1200,
          bodyStyle: "Coupe",
          exteriorColor: "Red",
          interiorColor: "Tan",
          drivetrain: "RWD",
          fuelType: "Gasoline",
          imageSrc: "/e2e-gallery-front.svg",
          sellerCity: "Miami",
          sellerState: "FL",
          isSpecial: false,
        },
        images: [
          { src: "/e2e-gallery-front.svg", alt: "Front view", isPrimary: true, sortOrder: 0 },
        ],
      }),
    }),
  );
  await page.route(`**/api/vehicles/${vehicleId}/price-signal?**`, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ enabled: false, reductions: 0 }) }),
  );
  await page.route("**/api/visitor/me", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Unauthorized" }) }),
  );
  await page.route("**/e2e-gallery-front.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#171717"/></svg>',
    }),
  );
}

test("submits a vehicle inquiry to the lead API and confirms only after success", async ({ page }) => {
  await prepareVehicle(page);
  let capturedBody: Record<string, unknown> | null = null;
  let capturedTenant = "";
  await page.route("**/api/leads?**", async (route) => {
    capturedBody = route.request().postDataJSON() as Record<string, unknown>;
    capturedTenant = route.request().headers()["x-lume-tenant"] ?? "";
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ leadId: "lead-1" }),
    });
  });

  await page.goto(`/vehicles/${vehicleId}?utm_source=google&utm_campaign=summer`);
  await page.getByRole("button", { name: "Request info" }).click();
  const dialog = page.getByRole("dialog", { name: /2024 Ferrari Roma/i });
  await dialog.getByLabel("Name").fill("Ada Lovelace");
  await dialog.getByLabel("Email").fill("ada@example.com");
  await dialog.getByLabel("Phone").fill("+1 555 0100");
  await dialog.getByRole("button", { name: "Send inquiry" }).click();

  await expect(dialog.getByText("Your inquiry was sent to the dealership.")).toBeVisible();
  expect(capturedTenant).toBeTruthy();
  expect(capturedBody).toMatchObject({
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    phone: "+1 555 0100",
    vehicleId,
    source: "contact-form",
    utmSource: "google",
    utmCampaign: "summer",
    sourceContext: {
      trigger: "vehicle-detail",
      actionType: "request-info",
      vehicleId,
      vehicleTitle: "2024 Ferrari Roma Coupe",
    },
  });
});

test("keeps the form open and displays an API validation error", async ({ page }) => {
  await prepareVehicle(page);
  await page.route("**/api/leads?**", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "Vehicle is unavailable" }),
    }),
  );

  await page.goto(`/vehicles/${vehicleId}`);
  await page.getByRole("button", { name: "Request info" }).click();
  const dialog = page.getByRole("dialog", { name: /2024 Ferrari Roma/i });
  await dialog.getByLabel("Name").fill("Ada Lovelace");
  await dialog.getByLabel("Email").fill("ada@example.com");
  await dialog.getByRole("button", { name: "Send inquiry" }).click();

  await expect(dialog.getByRole("alert")).toHaveText("Vehicle is unavailable");
  await expect(dialog.getByRole("button", { name: "Send inquiry" })).toBeEnabled();
});
