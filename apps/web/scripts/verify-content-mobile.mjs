import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { X509Certificate, createHash } from "node:crypto";

const origin = new URL(process.env.WEB_PREVIEW_FORM_TEST_ORIGIN ?? "");
assert.ok(
  origin.protocol === "https:" && origin.hostname.endsWith(".vercel.app"),
);
assert.equal(origin.pathname, "/");
assert.ok(
  !origin.search && !origin.hash && !origin.username && !origin.password,
);
const out = process.env.CONTENT_MOBILE_EVIDENCE_DIR;
assert.ok(out, "Set CONTENT_MOBILE_EVIDENCE_DIR explicitly");
fs.mkdirSync(out, { recursive: true });
const args = ["--no-sandbox"];
const caPath = "/usr/local/share/ca-certificates/environment-proxy-ca.crt";
if (process.env.HTTPS_PROXY && fs.existsSync(caPath)) {
  const ca = new X509Certificate(fs.readFileSync(caPath));
  args.push(
    "--ignore-certificate-errors-spki-list=" +
      createHash("sha256")
        .update(ca.publicKey.export({ type: "spki", format: "der" }))
        .digest("base64"),
  );
}
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args,
  proxy: process.env.HTTPS_PROXY
    ? { server: process.env.HTTPS_PROXY }
    : undefined,
});
const report = {
  origin: origin.origin,
  javaScriptEnabled: false,
  viewport: { width: 390, height: 844 },
  cases: [],
};
try {
  const context = await browser.newContext({
    viewport: report.viewport,
    javaScriptEnabled: false,
    reducedMotion: "reduce",
  });
  for (const template of ["luxury", "glo3d"])
    for (const theme of ["light", "dark"]) {
      for (const route of ["home", "contact", "products"]) {
        const page = await context.newPage();
        const requests = [];
        page.on("request", (r) => requests.push(r.url()));
        const url = new URL(route === "home" ? "/" : "/" + route, origin);
        url.search = new URLSearchParams({
          tenant: "demo",
          template,
          theme,
          evidence: Date.now().toString(36),
        }).toString();
        const response = await page.goto(url.href, {
          waitUntil: "load",
          timeout: 45000,
        });
        assert.equal(response.status(), 200);
        assert.match(response.headers()["x-robots-tag"], /noindex/);
        const result = await page.evaluate(() => ({
          title: document.title,
          h1: [...document.querySelectorAll("h1")].map((h) => h.textContent),
          contentLength: document.querySelector("main").innerText.trim().length,
          width: document.documentElement.scrollWidth,
          viewport: innerWidth,
          canvasCount: document.querySelectorAll("canvas").length,
          images: [...document.images]
            .filter((i) => i.src.includes(".r2.dev/"))
            .map((i) => ({
              src: i.currentSrc,
              loaded: i.complete && i.naturalWidth > 0,
            })),
          publishedRevision: document.querySelector("[data-published-revision]")
            ?.dataset.publishedRevision,
        }));
        assert.equal(result.h1.length, 1);
        assert.ok(result.contentLength > 80);
        assert.ok(
          result.width <= result.viewport + 1,
          `Horizontal overflow: ${JSON.stringify(result)}`,
        );
        assert.equal(result.canvasCount, 0);
        assert.ok(
          !requests.some((u) => /\.(glb|gltf)(\?|$)|\/api\/chat/.test(u)),
        );
        assert.ok(result.images.every((i) => i.loaded));
        const screenshot = `${template}-${theme}-${route}.jpg`;
        await page.screenshot({
          path: path.join(out, screenshot),
          type: "jpeg",
          quality: 80,
          fullPage: true,
        });
        if (route === "home") {
          await page
            .getByRole("navigation", { name: "Preview pages" })
            .getByRole("link", { name: "Products", exact: true })
            .click();
          assert.equal(new URL(page.url()).pathname, "/products");
          assert.equal(await page.locator("h1").count(), 1);
        }
        report.cases.push({
          template,
          theme,
          route,
          status: response.status(),
          ...result,
          screenshot,
          chatOrModelRequests: 0,
          nativeProductsLinkWorked: route === "home",
        });
        await page.close();
        console.log(`PASS mobile JS-off ${template}/${theme}/${route}`);
      }
    }
  assert.ok(
    report.cases.some((c) => c.images.some((i) => i.loaded)),
    "Actual R2 image decoded in the unmocked browser",
  );
  fs.writeFileSync(
    path.join(out, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
} finally {
  await browser.close();
}
