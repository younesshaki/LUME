import { chromium, devices } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import { X509Certificate, createHash } from "node:crypto";
const certificatePath = process.env.WEB_VERIFY_PROXY_CA;
const pinArgs = certificatePath
  ? [
      `--ignore-certificate-errors-spki-list=${createHash("sha256")
        .update(
          new X509Certificate(readFileSync(certificatePath)).publicKey.export({
            type: "spki",
            format: "der",
          }),
        )
        .digest("base64")}`,
    ]
  : [];
const base = process.env.WEB_VERIFY_BASE_URL ?? "http://127.0.0.1:3200";
const output = new URL("../artifacts/", import.meta.url);
await fs.mkdir(output, { recursive: true });
const route = "/vehicles/16b46448-d5d0-441f-a329-397ec236a1a1?tenant=demo";
const browser = await chromium.launch({
  executablePath: process.env.WEB_VERIFY_CHROMIUM ?? "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", ...pinArgs],
  ...(process.env.HTTPS_PROXY
    ? {
        proxy: {
          server: process.env.HTTPS_PROXY,
          bypass: "127.0.0.1,localhost",
        },
      }
    : {}),
});
try {
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    javaScriptEnabled: false,
  });
  const page = await context.newPage();
  const failures = [],
    requests = [];
  page.on("request", (r) => requests.push(r.url()));
  page.on("requestfailed", (r) => {
    if (r.failure()?.errorText === "csp" && r.resourceType() === "script")
      return;
    failures.push({ url: r.url(), reason: r.failure()?.errorText });
  });
  const response = await page.goto(base + route, { waitUntil: "networkidle" });
  assert.equal(response.status(), 200);
  await page.locator(".gallery img").first().waitFor({ state: "visible" });
  const title = await page.title();
  assert.match(title, /2023 Ferrari 812 GTS/);
  assert.equal(await page.locator("h1").count(), 1);
  assert.equal(
    await page.locator('link[rel="canonical"]').getAttribute("href"),
    base + route,
  );
  assert.ok(
    await page.locator('meta[property="og:image"]').getAttribute("content"),
  );
  assert.match(await page.locator("body").innerText(), /Est\. \$392,500/);
  assert.match(await page.locator(".specs").innerText(), /2,991 miles/);
  const image = await page
    .locator(".gallery img")
    .first()
    .evaluate((i) => ({
      complete: i.complete,
      width: i.naturalWidth,
      height: i.naturalHeight,
    }));
  if (!image.complete || !image.width) console.log({ image, failures });
  assert.ok(image.complete && image.width > 0, "real R2 photograph decoded");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  assert.equal(overflow, false);
  await page
    .getByRole("link", { name: "Check availability", exact: true })
    .click();
  assert.match(page.url(), /#availability$/);
  const contact = page.getByRole("link", {
    name: "Contact dealer",
    exact: true,
  });
  assert.ok(await contact.isVisible());
  assert.ok(!(await page.locator("canvas").count()));
  assert.equal(
    requests.filter((u) => /\.glb(?:\?|$)|\/api\/chat/.test(u)).length,
    0,
  );
  await page.screenshot({
    path: new URL("mobile-js-off.png", output).pathname,
    fullPage: true,
  });
  const evidence = {
    base,
    vehicleId: "16b46448-d5d0-441f-a329-397ec236a1a1",
    viewport: devices["iPhone 13"].viewport,
    javaScriptEnabled: false,
    proxyCertificatePolicy: certificatePath
      ? "Test-process-only SPKI pin for explicitly supplied proxy CA; no persistent trust change"
      : "Default Chromium certificate validation",
    status: response.status(),
    title,
    image,
    overflow,
    contactUrl: await contact.getAttribute("href"),
    modelOrChatRequests: 0,
    failures,
  };
  assert.equal(failures.length, 0);
  await fs.writeFile(
    new URL("mobile-proof.json", output),
    JSON.stringify(evidence, null, 2),
  );
  console.log(evidence);
  await context.close();
  const interactive = await browser.newContext({ ...devices["iPhone 13"] });
  const p = await interactive.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(base + route, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Enlarge photographs" }).click();
  await p.getByRole("dialog", { name: "Vehicle photographs" }).waitFor();
  await p.getByRole("button", { name: "Close photographs" }).click();
  await p.getByRole("button", { name: "Vehicle concierge preview" }).click();
  await p.getByRole("dialog", { name: "Vehicle concierge preview" }).waitFor();
  await p.getByRole("button", { name: "Close concierge" }).click();
  assert.deepEqual(errors, []);
  console.log(
    "PASS optional gallery and lazy client-only chat-entry dialog; zero browser errors.",
  );
  await interactive.close();
} finally {
  await browser.close();
}
