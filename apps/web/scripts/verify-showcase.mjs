import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash, X509Certificate } from "node:crypto";
import { chromium } from "@playwright/test";
import { JSDOM } from "jsdom";
import { DEFAULT_PAGES } from "@lume/blocks";
import { getSiteTemplate, normalizeSiteDesign } from "@lume/types";

const web = fileURLToPath(new URL("..", import.meta.url));
const out = process.env.SHOWCASE_EVIDENCE_DIR;
assert.ok(out, "Set SHOWCASE_EVIDENCE_DIR outside the repository");
fs.mkdirSync(out, { recursive: true });
const base = new URL(process.env.WEB_PREVIEW_R2_PUBLIC_BASE_URL ?? "");
assert.equal(base.protocol, "https:");
assert.ok(!base.username && !base.password && !base.search && !base.hash);
const modelUrl =
  base.href.replace(/\/$/, "") +
  "/vehicle%20images/3D%20assets/blackredbull6.optimized.glb";
const fixture = http.createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const url = new URL(req.url, "http://fixture");
  const input = raw ? JSON.parse(raw) : {};
  assert.equal(req.headers.apikey, "fixture-anon");
  let rows = [];
  if (url.pathname.endsWith("/tenant_by_slug") && input.p_slug === "demo")
    rows = [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        slug: "demo",
        name: "Local showcase fixture",
        status: "active",
      },
    ];
  else if (url.pathname.endsWith("/get_tenant_theme"))
    rows = [{ theme: normalizeSiteDesign({}, getSiteTemplate("luxury")) }];
  else if (url.pathname.endsWith("/get_published_page")) {
    const page = DEFAULT_PAGES.find((p) => p.slug === input.p_slug);
    if (page)
      rows = [
        {
          id: "local-" + page.slug,
          slug: page.slug,
          title: page.title,
          seo_meta: page.seoMeta,
          blocks: page.blocks,
          published_revision_id: "local-published",
        },
      ];
  }
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(rows));
});
await new Promise((r) => fixture.listen(0, "127.0.0.1", r));
const reservation = net.createServer();
await new Promise((r) => reservation.listen(0, "127.0.0.1", r));
const port = reservation.address().port;
await new Promise((r) => reservation.close(r));
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["scripts/run.mjs", "start"], {
  cwd: web,
  env: {
    ...process.env,
    PORT: String(port),
    WEB_PREVIEW_TEST_MODE: "1",
    WEB_PREVIEW_PROJECT_REF: "local-showcase-fixture",
    WEB_PREVIEW_SUPABASE_URL: `http://127.0.0.1:${fixture.address().port}`,
    WEB_PREVIEW_SUPABASE_ANON_KEY: "fixture-anon",
    WEB_PREVIEW_SUPABASE_SERVICE_ROLE_KEY: "",
    WEB_PREVIEW_DEFAULT_TENANT: "demo",
    WEB_PREVIEW_UPSTREAM_ORIGIN: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLogs = "";
child.stdout.on("data", (c) => (serverLogs += c));
child.stderr.on("data", (c) => (serverLogs += c));
const report = {
  source:
    "LOCAL production Next build and synthetic loopback tenant/content data; REAL public R2 GLB bytes. No remote tenant/config writes or deployment.",
  fixtureDatabase: true,
  corsHeaderDiagnostic: "Not yet run",
  observedAt: new Date().toISOString(),
  routes: {},
  rendering: {},
  hydrationErrors: [],
  openGates: [],
};
const save = () =>
  fs.writeFileSync(
    path.join(out, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
let browser;
try {
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null)
      throw Error("Next start failed: " + serverLogs);
    try {
      if ((await fetch(origin + "/robots.txt")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const receipt = JSON.parse(
    fs.readFileSync(path.join(web, ".next/analyze/showcase-client.json")),
  );
  const dependencies = receipt.modules.filter(
    (m) =>
      /(?:^|\/)node_modules\/(?:@react-three\/|three\/|three-stdlib\/|react-reconciler\/|lenis\/)/.test(
        m.resource,
      ) ||
      /components\/showcase-poc\/(?:ShowcaseScene|CameraRig|useDisposableGLTF)\.tsx?$/.test(
        m.resource,
      ),
  );
  const heavy = [...new Set(dependencies.flatMap((m) => m.chunks))].filter(
    (c) => c.endsWith(".js"),
  );
  assert.ok(heavy.length > 0, "Missing real build module/chunk receipt");
  assert.equal(
    receipt.modules.filter((m) =>
      /(?:^|\/)node_modules\/leva\//.test(m.resource),
    ).length,
    0,
    "Leva must have zero emitted production modules",
  );
  const assetByName = new Map(receipt.assets.map((a) => [a.name, a]));
  report.bundle = {
    source: receipt.source,
    definition:
      "Full async island including Three/R3F/drei, loader, private reconciler, Lenis and local scene/rig",
    moduleChunkReceipt: dependencies,
    heavyChunks: heavy.map((c) => assetByName.get(c)),
    emittedLevaModules: 0,
    rendererDependencies: [
      ...new Set(
        dependencies
          .map(
            (m) =>
              m.resource.match(
                /node_modules\/(?:@react-three\/(?:fiber|drei)|three|lenis)/,
              )?.[0],
          )
          .filter(Boolean),
      ),
    ],
  };
  const remote = await fetch(modelUrl, {
    headers: { Origin: origin },
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(remote.status, 200);
  const bytes = Buffer.from(await remote.arrayBuffer());
  assert.equal(bytes.subarray(0, 4).toString(), "glTF");
  const gltf = JSON.parse(
    bytes
      .subarray(20, 20 + bytes.readUInt32LE(12))
      .toString()
      .trim(),
  );
  report.r2 = {
    url: modelUrl,
    status: remote.status,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    contentType: remote.headers.get("content-type"),
    accessControlAllowOrigin: remote.headers.get("access-control-allow-origin"),
    extensions: gltf.extensionsUsed,
    meshDefinitions: gltf.meshes.length,
  };
  const previewCors = await fetch(modelUrl + "?evidence=" + Date.now(), {
    method: "GET",
    headers: { Origin: "https://lume-web-phase3-hakicsi89.vercel.app" },
  });
  report.r2.stablePreviewGet = {
    origin: "https://lume-web-phase3-hakicsi89.vercel.app",
    status: previewCors.status,
    bytes: (await previewCors.arrayBuffer()).byteLength,
    accessControlAllowOrigin: previewCors.headers.get(
      "access-control-allow-origin",
    ),
  };
  const args = [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-dev-shm-usage",
  ];
  const ca = "/usr/local/share/ca-certificates/environment-proxy-ca.crt";
  if (process.env.HTTPS_PROXY && fs.existsSync(ca))
    args.push(
      "--ignore-certificate-errors-spki-list=" +
        createHash("sha256")
          .update(
            new X509Certificate(fs.readFileSync(ca)).publicKey.export({
              type: "spki",
              format: "der",
            }),
          )
          .digest("base64"),
    );
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
    args,
    ...(process.env.HTTPS_PROXY
      ? {
          proxy: {
            server: process.env.HTTPS_PROXY,
            bypass: "127.0.0.1,localhost",
          },
        }
      : {}),
  });
  const context = async (options = {}) => {
    const c = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      ...options,
    });
    await c.addInitScript(() =>
      localStorage.setItem("lume-cookie-consent", "rejected"),
    );
    return c;
  };
  const bundleUsage = (urls) => [
    ...new Set(
      urls
        .map((u) => new URL(u).pathname)
        .filter((p) => p.startsWith("/_next/") && p.endsWith(".js"))
        .map((p) => decodeURIComponent(p.slice("/_next/".length))),
    ),
  ];
  for (const route of ["/", "/vehicles"]) {
    const c = await context();
    const p = await c.newPage();
    const requests = [];
    const errors = [];
    p.on("request", (r) => {
      if (r.url().endsWith(".js")) requests.push(r.url());
    });
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(origin + route + "?tenant=demo", { waitUntil: "networkidle" });
    const chunks = bundleUsage(requests);
    assert.ok(
      !chunks.some((c) => heavy.includes(c)),
      route + " requested a 3D dependency chunk",
    );
    report.routes[route] = {
      requestedJsChunks: chunks,
      initialJsBytes: chunks.reduce(
        (n, c) => n + (assetByName.get(c)?.bytes ?? 0),
        0,
      ),
      initialJsGzipBytes: chunks.reduce(
        (n, c) => n + (assetByName.get(c)?.gzipBytes ?? 0),
        0,
      ),
      heavyChunksRequested: [],
      pageErrors: errors,
    };
    assert.equal(errors.length, 0);
    await c.close();
  }
  const raw = await fetch(origin + "/showcase?tenant=demo");
  const html = await raw.text();
  fs.writeFileSync(path.join(out, "showcase.html"), html);
  const doc = new JSDOM(html).window.document;
  assert.equal(doc.querySelectorAll("h1").length, 1);
  assert.match(raw.headers.get("x-robots-tag"), /noindex/);
  report.ssr = {
    status: raw.status,
    title: doc.title,
    h1Count: 1,
    noindex: raw.headers.get("x-robots-tag"),
    canonical: doc.querySelector('link[rel="canonical"]').href,
  };
  const directContext = await context();
  const direct = await directContext.newPage();
  const directErrors = [];
  const directNetwork = [];
  direct.on("console", (m) => {
    if (m.type() === "error") directErrors.push(m.text());
  });
  direct.on("pageerror", (e) => directErrors.push(e.message));
  direct.on("requestfailed", (r) =>
    directNetwork.push({ url: r.url(), failure: r.failure()?.errorText }),
  );
  await direct.goto(origin + "/showcase?tenant=demo", {
    waitUntil: "domcontentloaded",
  });
  await direct.waitForFunction(
    () =>
      Number(
        document
          .querySelector('[data-testid="model-status"]')
          ?.getAttribute("data-meshes"),
      ) > 0 || !!document.querySelector('.showcase-poc [role="alert"]'),
    null,
    { timeout: 45000 },
  );
  const directReady =
    (await direct.locator('[data-testid="model-status"]').count()) > 0 &&
    Number(
      await direct
        .locator('[data-testid="model-status"]')
        .getAttribute("data-meshes"),
    ) > 0;
  report.r2.browser = {
    directAccess: directReady ? "proven" : "blocked",
    errors: directErrors,
    failedRequests: directNetwork,
  };
  report.hydrationErrors.push(
    ...directErrors.filter((e) =>
      /hydration|did not match|server.rendered HTML/i.test(e),
    ),
  );
  if (!directReady) {
    report.openGates.push(
      "R2 GET CORS for localhost and exact staging Preview origin; do not change production bucket/origins without owner approval",
    );
    await direct.screenshot({
      path: path.join(out, "r2-cors-blocked.jpg"),
      fullPage: false,
    });
  }
  await directContext.close();
  save();
  const c = await context();
  const requests = [];
  const errors = [];
  const consoles = [];
  const failed = [];
  const mediaResponses = [];
  // This diagnostic changes ONLY the test response header. Same real GLB bytes,
  // no app proxy, security flag, environment exemption, fake model or credentials.
  if (!directReady) {
    await c.route(modelUrl, (route) =>
      route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "model/gltf-binary",
          "Access-Control-Allow-Origin": origin,
        },
        body: bytes,
      }),
    );
    report.corsHeaderDiagnostic =
      "Real R2 GLB bytes with a test-only Access-Control-Allow-Origin response header; not direct R2 CORS proof";
  } else report.corsHeaderDiagnostic = "Not needed; direct R2 succeeded";
  const p = await c.newPage();
  p.setDefaultTimeout(20000);
  p.on("request", (r) => requests.push(r.url()));
  p.on("response", (response) => {
    if (
      response.url() === modelUrl ||
      response.url().startsWith("https://www.gstatic.com/draco/")
    ) {
      mediaResponses.push(
        (async () => ({
          url: response.url(),
          status: response.status(),
          decodedBytes: (await response.body()).length,
          testCorsHeader: response.url() === modelUrl && !directReady,
        }))(),
      );
    }
  });
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error") consoles.push(m.text());
  });
  p.on("requestfailed", (r) =>
    failed.push({ url: r.url(), failure: r.failure()?.errorText }),
  );
  await p.goto(origin + "/showcase?tenant=demo", {
    waitUntil: "domcontentloaded",
  });
  await p.waitForFunction(
    () =>
      Number(
        document
          .querySelector('[data-testid="model-status"]')
          ?.getAttribute("data-meshes"),
      ) > 0,
    null,
    { timeout: 45000 },
  );
  await p.waitForFunction(
    () => Number(document.querySelector("canvas")?.dataset.triangles) > 0,
  );
  const sample = () =>
    p.locator("canvas").evaluate((canvas) => ({
      progress: Number(canvas.dataset.progress),
      camera: canvas.dataset.camera.split(",").map(Number),
      drawCalls: Number(canvas.dataset.drawCalls),
      triangles: Number(canvas.dataset.triangles),
      scrollY: window.scrollY,
      lenis: document.documentElement.className,
      renderer: (() => {
        const gl = canvas.getContext("webgl2");
        const debug = gl?.getExtension("WEBGL_debug_renderer_info");
        return debug
          ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
          : gl?.getParameter(7937);
      })(),
      bounds: {
        top: canvas.getBoundingClientRect().top,
        bottom: canvas.getBoundingClientRect().bottom,
        height: canvas.getBoundingClientRect().height,
      },
    }));
  const start = await sample();
  await p.mouse.move(640, 450);
  await p.mouse.wheel(0, 1050);
  await p.waitForFunction(
    () => Number(document.querySelector("canvas")?.dataset.progress) > 0.25,
  );
  await p.waitForTimeout(600);
  const scrolled = await sample();
  assert.ok(scrolled.progress > start.progress + 0.2);
  assert.ok(Math.abs(scrolled.camera[2] - start.camera[2]) > 0.15);
  assert.match(scrolled.lenis, /lenis/);
  assert.ok(
    scrolled.bounds.top >= 0 &&
      scrolled.bounds.bottom <= 900 &&
      scrolled.bounds.height > 300,
    "Canvas must stay visible while scrolling",
  );
  await p.screenshot({ path: path.join(out, "scene-scrolled.jpg") });
  const initialChunks = bundleUsage(requests);
  report.routes["/showcase"] = {
    requestedInitialJsChunks: initialChunks,
    initialJsBytes: initialChunks.reduce(
      (n, c) => n + (assetByName.get(c)?.bytes ?? 0),
      0,
    ),
    initialJsGzipBytes: initialChunks.reduce(
      (n, c) => n + (assetByName.get(c)?.gzipBytes ?? 0),
      0,
    ),
    heavyChunksRequested: initialChunks.filter((c) => heavy.includes(c)),
  };
  report.rendering = {
    meshes: Number(
      await p
        .locator('[data-testid="model-status"]')
        .getAttribute("data-meshes"),
    ),
    start,
    scrolled,
  };
  await p.getByRole("link", { name: "Vehicles", exact: true }).click();
  await p.waitForURL((u) => u.pathname === "/vehicles");
  await p.waitForFunction(
    () => !document.documentElement.classList.contains("lenis"),
  );
  assert.equal(await p.locator("canvas").count(), 0);
  report.navigation = {
    exitToVehicles: { url: p.url(), lenisCleaned: true, canvasUnmounted: true },
  };
  await p.goBack();
  await p.waitForURL((u) => u.pathname === "/showcase");
  await p.waitForFunction(
    () =>
      Number(
        document
          .querySelector('[data-testid="model-status"]')
          ?.getAttribute("data-meshes"),
      ) > 0,
  );
  await p.waitForFunction(() => window.scrollY > 500);
  await p.waitForTimeout(700);
  const restored = await sample();
  assert.ok(
    Math.abs(restored.scrollY - scrolled.scrollY) < 100,
    "Next back scroll restoration changed",
  );
  report.navigation.back = restored;
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.waitForFunction(
    () =>
      Number(
        document
          .querySelector('[data-testid="model-status"]')
          ?.getAttribute("data-meshes"),
      ) > 0,
  );
  await p.waitForFunction(() => window.scrollY > 500);
  await p.waitForTimeout(700);
  report.navigation.refresh = await sample();
  assert.ok(
    Math.abs(report.navigation.refresh.scrollY - scrolled.scrollY) < 100,
  );
  await p.getByRole("link", { name: "Home", exact: true }).click();
  await p.waitForURL((u) => u.pathname === "/");
  await p.waitForFunction(
    () => !document.documentElement.classList.contains("lenis"),
  );
  report.navigation.exitToHome = {
    url: p.url(),
    lenisCleaned: true,
    canvasUnmounted: (await p.locator("canvas").count()) === 0,
  };
  assert.ok(report.navigation.exitToHome.canvasUnmounted);
  report.rendering.mediaResponses = await Promise.all(mediaResponses);
  report.rendering.errors = errors;
  report.rendering.consoleErrors = consoles;
  report.rendering.failedRequests = failed;
  report.hydrationErrors.push(
    ...[...errors, ...consoles].filter((e) =>
      /hydration|did not match|server.rendered HTML/i.test(e),
    ),
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(consoles, []);
  assert.deepEqual(failed, []);
  assert.deepEqual(report.hydrationErrors, []);
  const chunks = bundleUsage(requests);
  report.routes["/showcase"].lifecycleJourney = {
    requestedJsChunks: chunks,
    requestedUniqueJsBytes: chunks.reduce(
      (n, c) => n + (assetByName.get(c)?.bytes ?? 0),
      0,
    ),
    requestedUniqueJsGzipBytes: chunks.reduce(
      (n, c) => n + (assetByName.get(c)?.gzipBytes ?? 0),
      0,
    ),
    note: "Includes exit-to-vehicles and exit-to-home chunks from the lifecycle journey; not an initial-route size",
    heavyChunksRequested: chunks.filter((c) => heavy.includes(c)),
  };
  assert.equal(
    report.routes["/showcase"].heavyChunksRequested.length,
    heavy.length,
  );
  const reducedContext = await context({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  if (!directReady)
    await reducedContext.route(modelUrl, (route) =>
      route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "model/gltf-binary",
          "Access-Control-Allow-Origin": origin,
        },
        body: bytes,
      }),
    );
  const reduced = await reducedContext.newPage();
  await reduced.goto(origin + "/showcase?tenant=demo", {
    waitUntil: "domcontentloaded",
  });
  await reduced.waitForFunction(
    () =>
      Number(
        document
          .querySelector('[data-testid="model-status"]')
          ?.getAttribute("data-meshes"),
      ) > 0,
  );
  assert.equal(
    await reduced
      .locator('[data-testid="showcase-scene"]')
      .getAttribute("data-motion"),
    "reduced",
  );
  assert.ok(
    !(await reduced.locator("html").getAttribute("class"))?.includes("lenis"),
  );
  await reduced.screenshot({
    path: path.join(out, "scene-mobile-reduced.jpg"),
  });
  report.reducedMotion = {
    lenisDisabled: true,
    mode: "reduced",
    viewport: { width: 390, height: 844 },
  };
  report.serverErrors = /ReferenceError: (window|document)|hydration/i.test(
    serverLogs,
  );
  assert.equal(report.serverErrors, false);
  report.openGates.push(
    "Physical mobile/Safari GPU, full 12-scene shaders/audio/timing and performance are outside this spike",
  );
  save();
  console.log(
    JSON.stringify(
      {
        rendering: report.rendering,
        navigation: report.navigation,
        r2: report.r2.browser.directAccess,
        hydrationErrors: report.hydrationErrors,
        openGates: report.openGates,
      },
      null,
      2,
    ),
  );
} catch (error) {
  report.failure = error.message;
  save();
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  child.kill("SIGTERM");
  fixture.closeAllConnections();
  await new Promise((r) => fixture.close(r));
}
