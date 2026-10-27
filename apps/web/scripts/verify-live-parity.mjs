import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const dir = process.env.LIVE_PARITY_WORK;
if (!dir)
  throw new Error(
    "Set LIVE_PARITY_WORK to public snapshot/build evidence directory",
  );
const out = process.env.LIVE_PARITY_EVIDENCE ?? path.join(dir, "live-parity");
fs.mkdirSync(out, { recursive: true });
const publicData = JSON.parse(
  fs.readFileSync(path.join(dir, "published-snapshot.json")),
);
const vehicles = JSON.parse(
  fs.readFileSync(path.join(dir, "vehicle-snapshot.json")),
);
const settings = JSON.parse(
  fs.readFileSync(path.join(dir, "vite-live-settings.json")),
);
const vehicleId = vehicles.detail.vehicle.id;
const media = new Map();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-gpu"],
});
const report = {
  beforeCommit: "cff045f2479f4f8e6c741b3044af11356484ed6e",
  dataSource:
    "Frozen actual public staging snapshots; services is a labelled local published-document fixture; no remote tenant or page edits",
  productionPageRendererEnabled: settings.pageRendererEnabled,
  viewport: { width: 1280, height: 900 },
  cases: [],
};
const custom = {
  id: "local-services",
  slug: "services",
  title: "Services",
  seo_meta: {
    title: "Services | LUME Demo",
    description: "Published services fixture",
  },
  published_revision_id: "local-services-published",
  blocks: {
    version: 1,
    blocks: [
      {
        id: "services-hero",
        type: "hero",
        props: {
          title: "Dealership services",
          subtitle:
            "Local public-contract fixture; no remote publication created.",
        },
      },
      {
        id: "services-body",
        type: "rich-text",
        props: {
          body: "Service information rendered through the existing block registry.",
        },
      },
    ],
  },
};
const rpc = (pathname, args, template) => {
  if (pathname.endsWith("/tenant_by_slug"))
    return args.p_slug === "demo" ? [publicData.tenant] : [];
  if (pathname.endsWith("/get_tenant_theme"))
    return [
      {
        theme: {
          ...publicData.design[0].theme,
          template: { key: template, version: 1 },
        },
      },
    ];
  if (pathname.endsWith("/list_published_nav_pages")) return publicData.nav;
  if (pathname.endsWith("/get_published_page")) {
    assert.equal(args.p_tenant_id, publicData.tenant.id);
    const page = publicData.pages.find((p) => p.slug === args.p_slug)?.page;
    return page ? [page] : args.p_slug === "services" ? [custom] : [];
  }
  return [];
};
async function pixels(a, b) {
  const pa = await sharp(a)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pb = await sharp(b)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.deepEqual(pa.info, pb.info);
  let changed = 0,
    total = 0,
    max = 0;
  for (let i = 0; i < pa.data.length; i += 4) {
    let diff = 0;
    for (let c = 0; c < 3; c++) {
      const delta = Math.abs(pa.data[i + c] - pb.data[i + c]);
      max = Math.max(max, delta);
      total += delta;
      diff = Math.max(diff, delta);
    }
    if (diff > 0) changed++;
  }
  return {
    changedPixels: changed,
    totalPixels: pa.info.width * pa.info.height,
    maxChannelDelta: max,
    meanChannelDelta: total / (pa.info.width * pa.info.height * 3),
    exactPngMatch: a.equals(b),
  };
}
async function capture(p, name) {
  await p.mouse.move(0, 0);
  return p.screenshot({
    path: path.join(out, name),
    type: "png",
    animations: "disabled",
    caret: "hide",
  });
}
async function move(p, bottom) {
  await p.evaluate((bottom) => {
    const candidates = [
      ...document.querySelectorAll(
        ".storyHome,.contactPage,.productsPage,.vehicleDetail,.templateHome",
      ),
    ];
    const scroller = candidates.find(
      (e) => e.scrollHeight > e.clientHeight + 2,
    );
    if (scroller)
      scroller.scrollTo({
        top: bottom ? scroller.scrollHeight : 0,
        behavior: "instant",
      });
    else
      window.scrollTo({
        top: bottom ? document.documentElement.scrollHeight : 0,
        behavior: "instant",
      });
  }, bottom);
  await p.waitForTimeout(200);
}
try {
  for (const template of ["luxury", "glo3d"])
    for (const mode of ["light", "dark"])
      for (const slug of [
        "home",
        "contact",
        "products",
        "services",
        "vehicle",
      ]) {
        const entry = {
          template,
          mode,
          route: slug,
          fixture: slug === "services",
          samples: [],
        };
        for (const version of ["before", "after"]) {
          const context = await browser.newContext({
            viewport: report.viewport,
            reducedMotion: "reduce",
            locale: "en-US",
            timezoneId: "UTC",
          });
          await context.addInitScript((mode) => {
            localStorage.setItem("lume.dualMode", "standard");
            localStorage.setItem("lume.color-theme.v1", mode);
            localStorage.setItem("lume.color-theme.chosen.v1", "1");
            localStorage.setItem("lume-cookie-consent", "rejected");
          }, mode);
          const p = await context.newPage();
          p.setDefaultTimeout(15000);
          const errors = [],
            requests = [];
          await p.route("**/_vercel/**", (route) =>
            route.fulfill({
              status: 200,
              contentType: "text/javascript",
              body: "/* Isolated reference: platform telemetry is not sent. */",
            }),
          );
          p.on("pageerror", (e) => errors.push(e.message));
          p.on("response", (r) => {
            if (
              r.status() >= 400 &&
              ["script", "stylesheet"].includes(r.request().resourceType())
            ) {
              const pathname = new URL(r.url()).pathname;
              if (!pathname.includes("/assets/fonts/montserrat/"))
                errors.push(`asset ${pathname}: ${r.status()}`);
            }
          });
          await p.route(
            "https://pub-da3069790c6443f883e3991be965f766.r2.dev/**",
            async (route) => {
              const url = route.request().url();
              if (!media.has(url))
                media.set(
                  url,
                  (async () => {
                    const r = await fetch(url, {
                      signal: AbortSignal.timeout(20000),
                    });
                    return {
                      status: r.status,
                      contentType:
                        r.headers.get("content-type") ??
                        "application/octet-stream",
                      body: Buffer.from(await r.arrayBuffer()),
                    };
                  })(),
                );
              await route.fulfill(await media.get(url));
            },
          );
          await p.route("**/rest/v1/**", async (route) => {
            const request = route.request();
            if (request.method() === "OPTIONS") {
              await route.fulfill({
                status: 204,
                headers: {
                  "access-control-allow-origin": "*",
                  "access-control-allow-headers": "*",
                },
              });
              return;
            }
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              headers: { "access-control-allow-origin": "*" },
              body: JSON.stringify(
                rpc(
                  new URL(request.url()).pathname,
                  request.postDataJSON() ?? {},
                  template,
                ),
              ),
            });
          });
          await p.route("**/api/**", async (route) => {
            const request = route.request();
            const u = new URL(request.url());
            const cors = {
              "access-control-allow-origin": request.headers().origin ?? "*",
              "access-control-allow-credentials": "true",
              "access-control-allow-headers": "Content-Type,X-Lume-Tenant",
            };
            if (request.method() === "OPTIONS") {
              await route.fulfill({ status: 204, headers: cors });
              return;
            }
            let body = {},
              status = 200;
            if (u.pathname === "/api/vehicles/" + vehicleId)
              body = vehicles.detail;
            else if (u.pathname === "/api/vehicles") body = vehicles.inventory;
            else if (u.pathname === "/api/vehicles/facets")
              body = {
                facets: {
                  makes: ["Ferrari"],
                  models: ["812 GTS"],
                  states: [],
                  cities: [],
                },
              };
            else if (u.pathname === "/api/leads") {
              status = 201;
              body = { leadId: "local-parity-fixture" };
              requests.push({
                path: u.pathname,
                method: request.method(),
                tenant: request.headers()["x-lume-tenant"],
                body: request.postDataJSON(),
              });
            } else if (u.pathname === "/api/consent") {
              status = 201;
              body = { recorded: true };
              requests.push({
                path: u.pathname,
                method: request.method(),
                body: request.postDataJSON(),
              });
            }
            await route.fulfill({
              status,
              headers: cors,
              contentType: "application/json",
              body: JSON.stringify(body),
            });
          });
          const base = `http://127.0.0.1:${version === "before" ? 5174 : 5175}`;
          const route =
            slug === "home"
              ? "/"
              : slug === "vehicle"
                ? "/vehicles/" + vehicleId
                : "/" + slug;
          await p.goto(
            base + route + "?tenant=demo&utm_source=phase3-live-parity",
            { waitUntil: "load", timeout: 60000 },
          );
          await p.locator("main h1").first().waitFor();
          await p.waitForFunction(
            ({ template, mode }) =>
              document.documentElement.dataset.lumeTemplate === template &&
              document.documentElement.dataset.theme === mode,
            { template, mode },
          );
          await p.evaluate(() => document.fonts.ready);
          await p.waitForFunction(() =>
            [...document.querySelectorAll("main img")].every((i) => i.complete),
          );
          await p.evaluate(() =>
            Promise.all(
              [...document.querySelectorAll("main img")].map((i) =>
                i.decode().catch(() => {}),
              ),
            ),
          );
          if (slug === "vehicle")
            await p.waitForFunction(
              (title) => document.title.includes(title),
              [
                vehicles.detail.vehicle.year,
                vehicles.detail.vehicle.make,
                vehicles.detail.vehicle.model,
              ].join(" "),
            );
          await p.waitForTimeout(300);
          await move(p, false);
          const top = await capture(
            p,
            `${template}-${mode}-${slug}-${version}-top.png`,
          );
          await move(p, true);
          const bottom = await capture(
            p,
            `${template}-${mode}-${slug}-${version}-bottom.png`,
          );
          await move(p, false);
          const initial = {
            h1: await p.locator("main h1").allTextContents(),
            title: await p.title(),
            text: (await p.locator("main").allInnerTexts())
              .join("\n")
              .replace(/\s+/g, " ")
              .trim(),
          };
          const behavior = {};
          if (slug === "products") {
            await p
              .getByRole("tab", { name: "FRAGRANCE", exact: true })
              .click();
            await p.waitForTimeout(250);
            behavior.filteredCategories = await p
              .locator(".productsPage__cardCategory")
              .allTextContents();
            assert.ok(
              behavior.filteredCategories.length > 0 &&
                behavior.filteredCategories.every((v) => v === "fragrance"),
            );
            await p.getByRole("tab", { name: "ALL", exact: true }).click();
            await p.waitForTimeout(250);
            behavior.allProductCount = await p
              .locator(".productsPage__card")
              .count();
            await p.locator(".productsPage__card").first().press("Enter");
            await p.waitForURL("**/products/red-bull*");
            behavior.detailPath = new URL(p.url()).pathname;
            await p
              .getByRole("button", { name: "Back to Products", exact: true })
              .click();
            await p.waitForURL("**/products");
            behavior.backPath = new URL(p.url()).pathname;
          }
          if (slug === "contact") {
            await p.getByLabel("First name", { exact: true }).fill("Parity");
            await p.getByLabel("Last name", { exact: true }).fill("Fixture");
            await p
              .getByLabel("Email", { exact: true })
              .fill("parity@example.invalid");
            await p
              .getByLabel("How can we help?", { exact: true })
              .fill(
                "Local before/after contract fixture; no remote submission.",
              );
            await p
              .getByRole("button", { name: "Submit request", exact: true })
              .click();
            await p
              .getByText(
                "Request received. The dealership will follow up with you.",
                { exact: true },
              )
              .waitFor();
            behavior.leadSuccess = true;
          }
          if (slug === "vehicle") {
            await p
              .getByRole("button", {
                name: "View photo full screen",
                exact: true,
              })
              .click();
            await p
              .getByRole("button", { name: "Close photo viewer", exact: true })
              .waitFor();
            behavior.galleryDialog = true;
            await p
              .getByRole("button", { name: "Close photo viewer", exact: true })
              .click();
            const cta = p.getByRole("button", {
              name: "Request info",
              exact: true,
            });
            if (await cta.count()) {
              await cta.click();
              await p
                .getByRole("button", { name: "Close inquiry", exact: true })
                .waitFor();
              behavior.inquiryDialog = true;
              await p
                .getByRole("button", { name: "Close inquiry", exact: true })
                .click();
            }
          }
          const preferences = p.getByRole("button", {
            name: "Cookie preferences",
            exact: true,
          });
          if (await preferences.count()) {
            await preferences.first().click();
            await p
              .getByRole("dialog", { name: "Cookie consent", exact: true })
              .waitFor();
            await p
              .getByRole("button", { name: "Accept analytics", exact: true })
              .click();
            await p.waitForTimeout(100);
            const stored = JSON.parse(
              await p.evaluate(() =>
                localStorage.getItem("lume-cookie-consent"),
              ),
            );
            behavior.consent = {
              choice: stored.choice,
              version: stored.version,
            };
          }
          assert.deepEqual(errors, []);
          entry.samples.push({
            version,
            top,
            bottom,
            initial,
            behavior,
            requests,
            errors,
          });
          await context.close();
        }
        const [before, after] = entry.samples;
        const result = {
          template,
          mode,
          route: slug,
          fixture: entry.fixture,
          initialContentEqual:
            JSON.stringify(before.initial) === JSON.stringify(after.initial),
          behaviorEqual:
            JSON.stringify(before.behavior) === JSON.stringify(after.behavior),
          requestsEqual:
            JSON.stringify(before.requests) === JSON.stringify(after.requests),
          top: await pixels(before.top, after.top),
          bottom: await pixels(before.bottom, after.bottom),
          before: { ...before, top: undefined, bottom: undefined },
          after: { ...after, top: undefined, bottom: undefined },
        };
        report.cases.push(result);
        fs.writeFileSync(
          path.join(out, "report.json"),
          JSON.stringify(report, null, 2) + "\n",
        );
        console.log(
          `${template}/${mode}/${slug}: text=${result.initialContentEqual}, behavior=${result.behaviorEqual}, pixels=${result.top.changedPixels}/${result.bottom.changedPixels}`,
        );
      }
} finally {
  const timer = setTimeout(() => process.exit(1), 10000);
  await browser.close();
  clearTimeout(timer);
}
