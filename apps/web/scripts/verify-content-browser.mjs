import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { X509Certificate, createHash } from "node:crypto";
import assert from "node:assert/strict";
const web = fileURLToPath(new URL("..", import.meta.url));
const baseline = process.env.CONTENT_BASELINE_ROOT;
if (!baseline)
  throw new Error(
    "Set CONTENT_BASELINE_ROOT to an original Phase 2 checkout served on port 5174",
  );
const baselineSha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: baseline,
  encoding: "utf8",
}).trim();
assert.equal(baselineSha, "cff045f2479f4f8e6c741b3044af11356484ed6e");
const snapshot = JSON.parse(
  fs.readFileSync(path.join(web, "checks/fixtures/published-snapshot.json")),
);
const tenant = snapshot.tenant;
const custom = (slug) => ({
  id: `local-${slug}`,
  slug,
  title: slug === "services" ? "Services" : "Our story",
  seo_meta: {
    title: `${slug === "services" ? "Services" : "Our story"} | LUME Demo`,
    description: `Published ${slug} fixture`,
  },
  published_revision_id: `local-published-${slug}`,
  blocks: {
    version: 1,
    blocks: [
      {
        id: `${slug}-hero`,
        type: "hero",
        props: {
          title: slug === "services" ? "Dealership services" : "Our story",
          subtitle: "Published contract fixture; no remote content created.",
        },
      },
      {
        id: `${slug}-body`,
        type: "rich-text",
        props: {
          body: "Helpful dealership content is available without JavaScript.",
        },
      },
    ],
  },
});
let template = "luxury";
const data = (pathname, args) => {
  if (pathname.endsWith("/tenant_by_slug"))
    return args.p_slug === tenant.slug ? [tenant] : [];
  if (pathname.endsWith("/get_tenant_theme"))
    return [
      {
        theme: {
          ...snapshot.design[0].theme,
          template: { key: template, version: 1 },
        },
      },
    ];
  if (pathname.endsWith("/list_published_nav_pages")) return snapshot.nav;
  if (pathname.endsWith("/get_published_page")) {
    assert.equal(args.p_tenant_id, tenant.id);
    const p = snapshot.pages.find((p) => p.slug === args.p_slug)?.page;
    return p
      ? [p]
      : ["services", "our-story"].includes(args.p_slug)
        ? [custom(args.p_slug)]
        : [];
  }
  return [];
};
const fixture = http.createServer(async (req, res) => {
  let raw = "";
  for await (const c of req) raw += c;
  const u = new URL(req.url, "http://fixture");
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data(u.pathname, raw ? JSON.parse(raw) : {})));
});
await new Promise((r) => fixture.listen(0, "127.0.0.1", r));
const reservation = net.createServer();
await new Promise((r) => reservation.listen(0, "127.0.0.1", r));
const port = reservation.address().port;
await new Promise((r) => reservation.close(r));
const child = spawn(process.execPath, ["scripts/run.mjs", "start"], {
  cwd: web,
  env: {
    ...process.env,
    PORT: String(port),
    WEB_PREVIEW_TEST_MODE: "1",
    WEB_PREVIEW_PROJECT_REF: "local-browser-fixture",
    WEB_PREVIEW_SUPABASE_URL: `http://127.0.0.1:${fixture.address().port}`,
    WEB_PREVIEW_SUPABASE_ANON_KEY: "fixture-anon",
    WEB_PREVIEW_SUPABASE_SERVICE_ROLE_KEY: "",
    WEB_PREVIEW_DEFAULT_TENANT: "demo",
    WEB_PREVIEW_R2_PUBLIC_BASE_URL:
      "https://pub-da3069790c6443f883e3991be965f766.r2.dev",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
child.stdout.on("data", (c) => (logs += c));
child.stderr.on("data", (c) => (logs += c));
const args = ["--no-sandbox"];
const caPath = "/usr/local/share/ca-certificates/environment-proxy-ca.crt";
if (process.env.HTTPS_PROXY && fs.existsSync(caPath)) {
  const ca = new X509Certificate(fs.readFileSync(caPath));
  const pin = createHash("sha256")
    .update(ca.publicKey.export({ type: "spki", format: "der" }))
    .digest("base64");
  args.push(`--ignore-certificate-errors-spki-list=${pin}`);
}
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args,
  proxy: process.env.HTTPS_PROXY
    ? { server: process.env.HTTPS_PROXY, bypass: "127.0.0.1,localhost" }
    : undefined,
});
const out =
  process.env.CONTENT_EVIDENCE_DIR ??
  path.join(web, "artifacts/content-browser");
fs.mkdirSync(out, { recursive: true });
const filter = process.env.CONTENT_CASE;
const evidence =
  filter && fs.existsSync(path.join(out, "report.json"))
    ? JSON.parse(
        fs.readFileSync(path.join(out, "report.json")),
      ).evidence.filter((e) => `${e.template}/${e.mode}/${e.route}` !== filter)
    : [];
const mediaResponses = new Map();
async function context(mode) {
  const c = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
    locale: "en-US",
    timezoneId: "UTC",
  });
  await c.addInitScript((mode) => {
    localStorage.setItem("lume.dualMode", "standard");
    localStorage.setItem("lume.preview-mode.v1", "on");
    localStorage.setItem("lume.color-theme.v1", mode);
    localStorage.setItem("lume.color-theme.chosen.v1", "1");
    localStorage.setItem("lume-cookie-consent", "rejected");
  }, mode);
  return c;
}
try {
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/robots.txt`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  for (template of ["luxury", "glo3d"])
    for (const mode of ["light", "dark"])
      for (const slug of [
        "home",
        "contact",
        "products",
        "services",
        "our-story",
      ]) {
        if (filter && `${template}/${mode}/${slug}` !== filter) continue;
        const pair = {
          template,
          mode,
          route: slug,
          dataSource: ["services", "our-story"].includes(slug)
            ? "Local published-document fixture using the existing demo identity; no staging writes"
            : "Read-only snapshot of actual staging published content",
          baselineSha,
          samples: [],
        };
        for (const kind of ["vite", "vite-shared", "next"]) {
          const c = await context(mode);
          const p = await c.newPage();
          const errors = [];
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
            )
              errors.push(`asset ${new URL(r.url()).pathname}: ${r.status()}`);
          });
          async function media(route, key) {
            if (!mediaResponses.has(key))
              mediaResponses.set(
                key,
                (async () => {
                  const r = await fetch(
                    "https://pub-da3069790c6443f883e3991be965f766.r2.dev/" +
                      key,
                    { signal: AbortSignal.timeout(15000) },
                  );
                  return {
                    status: r.status,
                    contentType:
                      r.headers.get("content-type") ??
                      "application/octet-stream",
                    body: Buffer.from(await r.arrayBuffer()),
                  };
                })(),
              );
            await route.fulfill(await mediaResponses.get(key));
          }
          await p.route(
            "https://pub-da3069790c6443f883e3991be965f766.r2.dev/**",
            (route) =>
              media(route, new URL(route.request().url()).pathname.slice(1)),
          );
          if (kind.startsWith("vite")) {
            await p.route("**/r2/**", (route) =>
              media(route, new URL(route.request().url()).pathname.slice(4)),
            );
            await p.route("**/rest/v1/**", async (route) => {
              const req = route.request();
              const u = new URL(req.url());
              if (req.method() === "OPTIONS") {
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
                  data(u.pathname, req.postDataJSON() ?? {}),
                ),
              });
            });
            await p.route("**/api/**", (route) =>
              route.fulfill({
                status: 200,
                contentType: "application/json",
                body: "{}",
              }),
            );
          }
          const base = kind.startsWith("vite")
            ? `http://127.0.0.1:${kind === "vite" ? 5174 : 5175}`
            : `http://127.0.0.1:${port}`;
          const pathname = slug === "home" ? "/" : `/${slug}`;
          await p.goto(
            `${base}${pathname}?tenant=demo&template=${template}&theme=${mode}`,
            { waitUntil: "load", timeout: 60000 },
          );
          await p
            .locator("main.pageBuilderMain h1")
            .waitFor({ state: "visible", timeout: 30000 });
          await p.waitForFunction(
            ({ mode, template }) =>
              document.documentElement.dataset.theme === mode &&
              document.documentElement.dataset.lumeTemplate === template,
            { mode, template },
            { timeout: 30000 },
          );
          await p.waitForFunction(
            () => getComputedStyle(document.body).marginTop === "0px",
            {},
            { timeout: 30000 },
          );
          await p.evaluate(() => document.fonts.ready);
          await p
            .waitForFunction(
              () =>
                [...document.querySelectorAll("main img")].every(
                  (img) => img.complete,
                ),
              {},
              { timeout: 30000 },
            )
            .catch(() => {});
          await p.waitForTimeout(500);
          const main = p.locator("main.pageBuilderMain");
          const stats = await main.evaluate((el) => {
            const selectors = [
              "h1",
              "p",
              "h2",
              ".productsPage__filters",
              ".productsPage__card",
              ".storyHome__flatCard",
              ".conciergeLeadForm",
            ];
            return {
              text: (() => {
                const copy = el.cloneNode(true);
                copy.querySelectorAll("noscript").forEach((n) => n.remove());
                return copy.textContent.replace(/\s+/g, " ").trim();
              })(),
              h1: [...el.querySelectorAll("h1")].map((x) => x.textContent),
              box: {
                width: el.getBoundingClientRect().width,
                height: el.getBoundingClientRect().height,
              },
              styles: selectors.flatMap((selector) => {
                const x = el.querySelector(selector);
                if (!x) return [];
                const s = getComputedStyle(x);
                return [
                  {
                    selector,
                    fontFamily: s.fontFamily,
                    fontSize: s.fontSize,
                    fontWeight: s.fontWeight,
                    color: s.color,
                    backgroundColor: s.backgroundColor,
                    borderRadius: s.borderRadius,
                  },
                ];
              }),
              images: [...el.querySelectorAll("img")].map((img) => ({
                loaded: img.complete && img.naturalWidth > 0,
                alt: img.alt,
              })),
            };
          });
          const file = `${template}-${mode}-${slug}-${kind}.jpg`;
          // Flatten only scrolling ancestors for a complete main-content capture.
          // Preserve the original viewport-fixed backdrop and exclude Phase 4 chrome.
          await main.evaluate((el) => {
            document
              .querySelectorAll(
                "header,footer,nav,.modeToggle,[class*='Dock'],[class*='dock']",
              )
              .forEach((n) => {
                if (!el.contains(n) && !n.contains(el))
                  n.style.visibility = "hidden";
              });
            document
              .querySelectorAll(
                ".cinematicShell__image,.cinematicShell__overlay",
              )
              .forEach((n) => (n.style.position = "fixed"));
            for (
              let n = el.parentElement;
              n && n !== document.documentElement;
              n = n.parentElement
            ) {
              n.style.overflow = "visible";
              n.style.height = "auto";
              n.style.maxHeight = "none";
              if (
                ["fixed", "absolute"].includes(getComputedStyle(n).position)
              ) {
                n.style.position = "relative";
                n.style.inset = "auto";
              }
            }
            window.scrollTo(0, 0);
          });
          await main.screenshot({
            path: path.join(out, file),
            type: "jpeg",
            quality: 78,
            animations: "disabled",
            style:
              ".siteHeader,.bottomDock,.siteChatWidget,.cookieBanner{visibility:hidden!important}",
          });
          assert.deepEqual(
            errors,
            [],
            `${template}/${mode}/${slug}/${kind} browser errors`,
          );
          pair.samples.push({ kind, file, ...stats, errors });
          await c.close();
        }
        const legacy = pair.samples.find((s) => s.kind === "vite"),
          next = pair.samples.find((s) => s.kind === "next");
        const shared = pair.samples.find((s) => s.kind === "vite-shared");
        pair.extractedViteSameText = legacy.text === shared.text;
        pair.extractedViteSameStyles =
          JSON.stringify(legacy.styles) === JSON.stringify(shared.styles);
        pair.sameText = legacy.text === next.text;
        pair.sameH1 = JSON.stringify(legacy.h1) === JSON.stringify(next.h1);
        pair.styleDifferences = legacy.styles.flatMap((style) => {
          const found = next.styles.find((s) => s.selector === style.selector);
          return JSON.stringify(style) === JSON.stringify(found)
            ? []
            : [{ legacy: style, next: found }];
        });
        console.log(
          `${template}/${mode}/${slug}: text=${pair.sameText}, h1=${pair.sameH1}, styleDifferences=${pair.styleDifferences.length}`,
        );
        evidence.push(pair);
        fs.writeFileSync(
          path.join(out, "report.json"),
          JSON.stringify(
            {
              scope:
                "Published main content; scrolling ancestors flattened only for complete screenshots (text/styles/geometry sampled before flattening); global navigation/footer/visitor adaptation is Phase 4 and excluded. Template override only; staging remains Luxury/demo.",
              evidence,
            },
            null,
            2,
          ) + "\n",
        );
      }
} finally {
  await browser.close();
  child.kill("SIGTERM");
  await new Promise((r) => child.once("exit", r));
  fixture.closeAllConnections();
  await new Promise((r) => fixture.close(r));
}
