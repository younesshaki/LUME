import { expect, test } from "@playwright/test";

test("uses the persisted website mode before paint and switches resolved tokens", async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("lume.gate-passed.v1", "1");
    window.localStorage.setItem("lume.color-theme.v1", "light");
  });
  await page.route("**/api/visitor/me", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Unauthorized" }) }),
  );

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
  await page.route("**/api/visitor/me", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Unauthorized" }) }),
  );

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
