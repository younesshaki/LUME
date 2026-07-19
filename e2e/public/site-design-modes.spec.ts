import { expect, test, type Page } from "@playwright/test";

const inventoryVehicle = {
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
  imageSrc: "/e2e-light-inventory.svg",
  sellerCity: "Miami",
  sellerState: "FL",
  isSpecial: false,
};

async function stubAnonymousVisitor(page: Page) {
  await page.route("**/api/visitor/me", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Unauthorized" }),
    }),
  );
}

test("uses the persisted website mode before paint and switches resolved tokens", async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("lume.gate-passed.v1", "1");
    window.localStorage.setItem("lume.color-theme.v1", "light");
  });
  await stubAnonymousVisitor(page);

  await page.goto("/home");
  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-theme", "light");
  await expect.poll(() => root.evaluate((element) =>
    getComputedStyle(element).getPropertyValue("--theme-lume-background").trim(),
  )).toBe("#f4efe5");

  const toggle = page.getByRole("button", { name: /Color theme: Light\. Switch to Dark/i });
  await toggle.click();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => root.evaluate((element) =>
    getComputedStyle(element).getPropertyValue("--theme-lume-background").trim(),
  )).toBe("#000");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("lume.color-theme.v1"))).toBe("dark");
});

test("keeps core public surfaces readable in Luxury light mode", async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("lume.gate-passed.v1", "1");
    window.localStorage.setItem("lume.color-theme.v1", "light");
  });
  await stubAnonymousVisitor(page);

  for (const path of ["/home", "/account"]) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    const colors = await page.locator("body").evaluate((element) => {
      const style = getComputedStyle(element);
      return { color: style.color, background: style.backgroundColor };
    });
    expect(colors.color).not.toBe(colors.background);
  }
});

test("renders inventory cards and the global header with the active light palette", async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("lume.gate-passed.v1", "1");
    window.localStorage.setItem("lume.color-theme.v1", "light");
    window.localStorage.setItem("lume-cookie-consent", "accepted");
  });
  await stubAnonymousVisitor(page);
  await page.route("**/api/vehicles/facets?*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ makes: ["Porsche"], models: ["911"], states: ["FL"], cities: ["Miami"] }),
    }),
  );
  await page.route("**/api/vehicles?*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ vehicles: [inventoryVehicle], totalCount: 1, hasMore: false }),
    }),
  );
  await page.route("**/e2e-light-inventory.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#171717" /></svg>',
    }),
  );

  await page.goto("/vehicles?tenant=default&preview=off");
  await expect(page.getByRole("heading", { name: "Porsche 911" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  const treatment = await page.locator(".vehiclesPage__card").evaluate((card) => {
    const cardStyle = getComputedStyle(card);
    const title = card.querySelector(".vehiclesPage__cardTitle");
    const header = document.querySelector(".siteHeader");
    return {
      cardColor: cardStyle.color,
      cardBackground: cardStyle.backgroundImage,
      titleColor: title ? getComputedStyle(title).color : "",
      headerBackground: header ? getComputedStyle(header).backgroundColor : "",
    };
  });

  expect(treatment.cardColor).toBe("rgb(33, 29, 22)");
  expect(treatment.titleColor).toBe("rgb(33, 29, 22)");
  expect(treatment.cardBackground).not.toContain("rgba(18, 14, 15");
  expect(treatment.headerBackground).not.toBe("rgb(0, 0, 0)");
});
