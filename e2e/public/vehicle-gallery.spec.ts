import { expect, test } from "@playwright/test";

const vehicleId = "11111111-1111-4111-8111-111111111111";

test("navigates a managed multi-image vehicle gallery and lightbox", async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("lume.gate-passed.v1", "1");
  });
  await page.route(`**/api/vehicles/${vehicleId}?**`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        vehicle: {
          id: vehicleId,
          stockType: "Used",
          year: 2022,
          make: "BMW",
          model: "X5",
          trim: "xDrive40i",
          price: 58000,
          mileage: 12000,
          bodyStyle: "SUV",
          exteriorColor: "Black",
          interiorColor: "Tan",
          drivetrain: "AWD",
          fuelType: "Gasoline",
          imageSrc: "/vehicles/fallback.webp",
          sellerCity: "Denver",
          sellerState: "CO",
          isSpecial: false,
        },
        images: [
          { src: "/e2e-gallery-front.svg", alt: "Front view", isPrimary: true, sortOrder: 0 },
          { src: "/e2e-gallery-side.svg", alt: "Side view", isPrimary: false, sortOrder: 1 },
          { src: "/e2e-gallery-rear.svg", alt: "Rear view", isPrimary: false, sortOrder: 2 },
        ],
      }),
    });
  });
  await page.route(`**/api/vehicles/${vehicleId}/price-signal?**`, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ enabled: false, reductions: 0 }) }),
  );
  await page.route("**/api/visitor/me", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Unauthorized" }) }),
  );
  await page.route("**/e2e-gallery-*.svg", (route) => {
    const label = route.request().url().match(/e2e-gallery-([a-z]+)\.svg/)?.[1] ?? "photo";
    return route.fulfill({
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#171717"/><text x="600" y="420" text-anchor="middle" fill="#d4af37" font-size="72">${label}</text></svg>`,
    });
  });

  await page.goto(`/vehicles/${vehicleId}`);
  const gallery = page.locator(".vehicleGallery");
  await expect(gallery.getByRole("img", { name: "Front view" })).toBeVisible();
  await gallery.getByRole("button", { name: "Next photo" }).first().click();
  await expect(gallery.getByRole("img", { name: "Side view" })).toBeVisible();

  await gallery.getByRole("group", { name: /photos/i }).press("ArrowRight");
  await expect(gallery.getByRole("img", { name: "Rear view" })).toBeVisible();

  const expand = gallery.getByRole("button", { name: "View photo full screen" });
  await expand.click();
  const lightbox = page.getByRole("dialog", { name: /photo viewer/i });
  await expect(lightbox).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /photo viewer/i })).toHaveCount(0);
  await expect(expand).toBeFocused();
});
