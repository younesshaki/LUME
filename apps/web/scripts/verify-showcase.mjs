import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
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
const sceneTitles = [
  "Showcase",
  "Signal",
  "Reveal",
  "Craft",
  "Experience",
  "Trust",
  "Benefits",
  "Differentiation",
  "Momentum",
  "Statement",
  "Scene 11",
  "Product",
];
const sceneCount = sceneTitles.length;
const sceneDurations = sceneTitles.map((_, i) => (i === 11 ? 20 : 25));
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
    WEB_PREVIEW_PROJECT_REF: "local-showcase-foundation-fixture",
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
    "Local production Next build with synthetic loopback tenant/content data; real public R2 GLB. No hosted Next deployment or remote data/config changes.",
  observedAt: new Date().toISOString(),
  applicationCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: web,
    encoding: "utf8",
  }).trim(),
  unhandledErrors: [],
  routes: {},
  cases: [],
  hydrationErrors: [],
  openGates: [],
};
const save = () =>
  fs.writeFileSync(
    path.join(out, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
function browserAudit() {
  const audit = {
    workersCreated: 0,
    workersTerminated: 0,
    bitmapsClosed: 0,
    audioContexts: 0,
    mediaPlayCalls: 0,
    contexts: [],
    blobsCreated: 0,
    blobsRevoked: 0,
  };
  window.__showcaseAudit = audit;
  for (const key of ["AudioContext", "webkitAudioContext"]) {
    const Original = window[key];
    if (Original)
      window[key] = class extends Original {
        constructor(...args) {
          super(...args);
          audit.audioContexts++;
        }
      };
  }
  const mediaPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    audit.mediaPlayCalls++;
    return mediaPlay.apply(this, args);
  };
  const workers = new WeakSet(),
    oldWorker = window.Worker;
  window.Worker = class extends oldWorker {
    constructor(...args) {
      super(...args);
      audit.workersCreated++;
    }
    terminate() {
      if (!workers.has(this)) {
        workers.add(this);
        audit.workersTerminated++;
      }
      return super.terminate();
    }
  };
  const bitmaps = new WeakSet(),
    close = ImageBitmap.prototype.close;
  ImageBitmap.prototype.close = function () {
    if (!bitmaps.has(this)) {
      bitmaps.add(this);
      audit.bitmapsClosed++;
    }
    return close.call(this);
  };
  const urls = new Set(),
    create = URL.createObjectURL.bind(URL),
    revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (...args) => {
    const url = create(...args);
    urls.add(url);
    audit.blobsCreated++;
    return url;
  };
  URL.revokeObjectURL = (url) => {
    if (urls.delete(url)) audit.blobsRevoked++;
    revoke(url);
  };
  const targets = new WeakMap(),
    sceneShaders = new WeakSet(),
    scenePrograms = new WeakSet();
  const contexts = new WeakMap(),
    getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (...args) {
    const gl = getContext.apply(this, args);
    if (gl && String(args[0]).startsWith("webgl") && !contexts.has(gl)) {
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      const item = {
        lost: false,
        draws: 0,
        indexedElements: 0,
        created: {},
        deleted: {},
        deletedWhileLive: {},
        renderTargetTextures: 0,
        renderTargetTexturesDeletedWhileLive: 0,
        renderer: debug
          ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
      };
      contexts.set(gl, item);
      targets.set(gl, { textures: new Set(), deleted: new Set() });
      audit.contexts.push(item);
      this.addEventListener("webglcontextlost", () => {
        item.lost = true;
      });
    }
    return gl;
  };
  for (const cls of [WebGLRenderingContext, WebGL2RenderingContext]) {
    // Sample the perspective scene (including Sparkles), not full-screen pass cameras.
    const shaderSource = cls.prototype.shaderSource,
      attachShader = cls.prototype.attachShader;
    cls.prototype.shaderSource = function (shader, source) {
      if (/#define STANDARD\b|viewMatrix\s*\*\s*modelPosition/.test(source))
        sceneShaders.add(shader);
      return shaderSource.call(this, shader, source);
    };
    cls.prototype.attachShader = function (program, shader) {
      if (sceneShaders.has(shader)) scenePrograms.add(program);
      return attachShader.call(this, program, shader);
    };
    const attachTexture = cls.prototype.framebufferTexture2D;
    cls.prototype.framebufferTexture2D = function (...args) {
      const item = contexts.get(this),
        record = targets.get(this),
        texture = args[3];
      if (item && texture && !record.textures.has(texture)) {
        record.textures.add(texture);
        item.renderTargetTextures++;
      }
      return attachTexture.apply(this, args);
    };
    const locations = new WeakMap(),
      getLocation = cls.prototype.getUniformLocation,
      writeMatrix = cls.prototype.uniformMatrix4fv;
    cls.prototype.getUniformLocation = function (...args) {
      const loc = getLocation.apply(this, args);
      if (loc)
        locations.set(loc, {
          name: args[1],
          scene: scenePrograms.has(args[0]),
        });
      return loc;
    };
    cls.prototype.uniformMatrix4fv = function (loc, transpose, value, ...rest) {
      const item = contexts.get(this);
      if (
        item &&
        locations.get(loc)?.name === "viewMatrix" &&
        locations.get(loc)?.scene
      ) {
        const m = Array.from(value);
        item.cameraPosition = [
          -(m[0] * m[12] + m[1] * m[13] + m[2] * m[14]),
          -(m[4] * m[12] + m[5] * m[13] + m[6] * m[14]),
          -(m[8] * m[12] + m[9] * m[13] + m[10] * m[14]),
        ];
        item.cameraSamples = (item.cameraSamples ?? 0) + 1;
      }
      return writeMatrix.call(this, loc, transpose, value, ...rest);
    };
    for (const kind of [
      "Texture",
      "Buffer",
      "Program",
      "Framebuffer",
      "Renderbuffer",
    ]) {
      const createName = "create" + kind,
        deleteName = "delete" + kind,
        originalCreate = cls.prototype[createName],
        originalDelete = cls.prototype[deleteName];
      cls.prototype[createName] = function (...args) {
        const result = originalCreate.apply(this, args),
          r = contexts.get(this);
        if (r && result) r.created[kind] = (r.created[kind] ?? 0) + 1;
        return result;
      };
      cls.prototype[deleteName] = function (...args) {
        const r = contexts.get(this);
        if (r && args[0]) {
          r.deleted[kind] = (r.deleted[kind] ?? 0) + 1;
          if (!this.isContextLost()) {
            r.deletedWhileLive[kind] = (r.deletedWhileLive[kind] ?? 0) + 1;
            const record = targets.get(this);
            if (
              kind === "Texture" &&
              record.textures.has(args[0]) &&
              !record.deleted.has(args[0])
            ) {
              record.deleted.add(args[0]);
              r.renderTargetTexturesDeletedWhileLive++;
            }
          }
        }
        return originalDelete.apply(this, args);
      };
    }
    for (const name of [
      "drawArrays",
      "drawElements",
      "drawArraysInstanced",
      "drawElementsInstanced",
    ]) {
      const fn = cls.prototype[name];
      if (!fn) continue;
      cls.prototype[name] = function (...args) {
        const r = contexts.get(this);
        if (r) {
          r.draws++;
          if (name.startsWith("drawElements")) r.indexedElements += args[1];
        }
        return fn.apply(this, args);
      };
    }
  }
}
function emptyGLB() {
  const json = Buffer.from(
    JSON.stringify({
      asset: { version: "2.0" },
      scenes: [{ nodes: [] }],
      scene: 0,
    }),
  );
  const data = Buffer.concat([
    json,
    Buffer.alloc((4 - (json.length % 4)) % 4, 32),
  ]);
  const buffer = Buffer.alloc(20 + data.length);
  buffer.writeUInt32LE(0x46546c67, 0);
  buffer.writeUInt32LE(2, 4);
  buffer.writeUInt32LE(buffer.length, 8);
  buffer.writeUInt32LE(data.length, 12);
  buffer.writeUInt32LE(0x4e4f534a, 16);
  data.copy(buffer, 20);
  return buffer;
}
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
      /(?:^|\/)node_modules\/(?:@react-three\/|three\/|three-stdlib\/|react-reconciler\/|lenis\/|postprocessing\/|n8ao\/)/.test(
        m.resource,
      ) ||
      /components\/showcase\/(?:Experience|ShowcaseCanvas|OpeningScene|useDisposableGLTF|model-resource|loadModel|disposeModel|ModelBoundary|CameraRig|camera-path|useStoryScroll|StoryBridge|StoryConsent|StoryNarrative|story-store|story-cues|ShowcaseEffects|composer-ownership)\./.test(
        m.resource,
      ),
  );
  const heavy = [...new Set(dependencies.flatMap((m) => m.chunks))].filter(
      (p) => p.endsWith(".js"),
    ),
    byName = new Map(receipt.assets.map((a) => [a.name, a]));
  assert.ok(heavy.length);
  assert.equal(
    receipt.modules.filter((m) =>
      /(?:^|\/)node_modules\/(?:leva|r3f-perf)\//.test(m.resource),
    ).length,
    0,
  );
  assert.equal(
    receipt.modules.filter((m) =>
      /(?:^|\/)node_modules\/n8ao\//.test(m.resource),
    ).length,
    0,
    "unused N8AO must not return through a barrel import",
  );
  assert.equal(
    receipt.modules.filter((m) =>
      /(?:^|\/)node_modules\/@react-three\/postprocessing\//.test(m.resource),
    ).length,
    0,
    "removed unused React postprocessing wrapper must not enter the client bundle",
  );
  report.bundle = {
    source: receipt.source,
    heavyChunks: heavy.map((c) => byName.get(c)),
    moduleChunkReceipt: dependencies,
    emittedLevaModules: 0,
    emittedPerfModules: 0,
    emittedN8AOModules: 0,
    emittedReactPostprocessingModules: 0,
  };
  const remote = await fetch(modelUrl, {
    headers: { Origin: origin },
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(remote.status, 200);
  const bytes = Buffer.from(await remote.arrayBuffer());
  assert.equal(bytes.subarray(0, 4).toString(), "glTF");
  report.r2 = {
    url: modelUrl,
    status: remote.status,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    accessControlAllowOrigin: remote.headers.get("access-control-allow-origin"),
  };
  const stable = await fetch(modelUrl + "?evidence=" + Date.now(), {
    headers: { Origin: "https://lume-web-phase3-hakicsi89.vercel.app" },
  });
  report.r2.stablePreview = {
    status: stable.status,
    origin: "https://lume-web-phase3-hakicsi89.vercel.app",
    accessControlAllowOrigin: stable.headers.get("access-control-allow-origin"),
  };
  await stable.arrayBuffer();
  const args = [
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--disable-dev-shm-usage",
    ],
    ca = "/usr/local/share/ca-certificates/environment-proxy-ca.crt";
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
    await c.addInitScript(() => {
      // A newly created about:blank document has no storage origin.
      if (location.protocol === "http:" || location.protocol === "https:")
        localStorage.setItem("lume-cookie-consent", "rejected");
    });
    await c.addInitScript(browserAudit);
    c.on("page", (page) => {
      page.on("pageerror", (error) =>
        report.unhandledErrors.push({
          url: page.url(),
          message: error.message,
        }),
      );
      page.on("console", (message) => {
        if (
          message.type() === "error" &&
          /hydration|did not match|server.rendered HTML|ReferenceError: (window|document)/i.test(
            message.text(),
          )
        )
          report.hydrationErrors.push(message.text());
      });
    });
    return c;
  };
  const usage = (urls) => [
    ...new Set(
      urls
        .map((u) => new URL(u).pathname)
        .filter((p) => p.startsWith("/_next/") && p.endsWith(".js"))
        .map((p) => decodeURIComponent(p.slice(7))),
    ),
  ];
  for (const route of [
    "/",
    "/vehicles",
    "/showcase",
    "/showcase/intro",
    "/intro",
  ]) {
    const c = await context(),
      p = await c.newPage(),
      requests = [],
      errors = [];
    p.on("request", (r) => requests.push(r.url()));
    p.on("pageerror", (e) => errors.push(e.message));
    const routeResponse = await p.goto(origin + route + "?tenant=demo", {
      waitUntil: "networkidle",
    });
    if (route === "/intro") assert.equal(routeResponse.status(), 404);
    const chunks = usage(requests);
    assert.ok(
      !chunks.some((c) => heavy.includes(c)),
      route + " loaded the engine",
    );
    assert.ok(!requests.some((u) => u === modelUrl));
    report.routes[route] = {
      status: routeResponse.status(),
      jsChunks: chunks,
      jsBytes: chunks.reduce((n, c) => n + (byName.get(c)?.bytes ?? 0), 0),
      gzipBytes: chunks.reduce(
        (n, c) => n + (byName.get(c)?.gzipBytes ?? 0),
        0,
      ),
      heavyChunksRequested: [],
      pageErrors: errors,
    };
    assert.equal(errors.length, 0);
    await c.close();
  }
  for (const route of [
    "/showcase",
    "/showcase/intro",
    "/showcase/experience",
  ]) {
    const response = await fetch(
        origin + route + "?tenant=demo&part=6&chapter=0",
      ),
      html = await response.text(),
      doc = new JSDOM(html).window.document;
    assert.equal(response.status, 200);
    assert.equal(doc.querySelectorAll("h1").length, 1);
    assert.match(response.headers.get("x-robots-tag"), /noindex/);
    assert.ok(doc.querySelector("noscript"));
    fs.writeFileSync(
      path.join(out, route.split("/").filter(Boolean).join("-") + ".html"),
      html,
    );
    report.cases.push({
      case: "raw SSR",
      route,
      status: response.status,
      title: doc.title,
      h1Count: 1,
      canonical: doc.querySelector('link[rel="canonical"]').href,
      noindex: response.headers.get("x-robots-tag"),
    });
  }
  for (const query of [
    "tenant=missing",
    "tenant=demo&part=6&part=6",
    "tenant=demo&chapter=1",
    "tenant=demo&part=abc",
    "tenant=demo&draft=true",
  ]) {
    const r = await fetch(origin + "/showcase/experience?" + query);
    assert.equal(r.status, 404);
    report.cases.push({ case: "negative selector", query, status: r.status });
  }
  const directContext = await context(),
    direct = await directContext.newPage(),
    directErrors = [];
  direct.on("console", (m) => {
    if (m.type() === "error") directErrors.push(m.text());
  });
  await direct.goto(origin + "/showcase/experience?tenant=demo", {
    waitUntil: "domcontentloaded",
  });
  await direct.waitForFunction(
    () =>
      !!document.querySelector("canvas") ||
      !!document.querySelector('.showcase [role="alert"]'),
    null,
    { timeout: 45000 },
  );
  const directReady = (await direct.locator("canvas").count()) > 0;
  report.r2.browser = {
    directAccess: directReady ? "proven" : "blocked",
    errors: directErrors,
  };
  report.hydrationErrors.push(
    ...directErrors.filter((e) =>
      /hydration|did not match|server.rendered HTML/i.test(e),
    ),
  );
  if (!directReady) {
    report.openGates.push(
      "Hosted direct model-render proof (5e) requires owner-approved R2 CORS for Preview origins; no R2 mutation in this task",
    );
    await direct.screenshot({ path: path.join(out, "r2-cors-blocked.jpg") });
  }
  await directContext.close();
  save();
  const c = await context(),
    p = await c.newPage(),
    requests = [],
    errors = [],
    consoleErrors = [],
    media = [];
  report.successfulRender = { pageErrors: errors, consoleErrors };
  let mode = "loading",
    release;
  const pending = new Promise((r) => (release = r));
  // The one inherited POC diagnostic stays HERE, never in runtime app code.
  await c.route(modelUrl, async (route) => {
    if (mode === "loading") await pending;
    if (mode === "bad")
      return route.fulfill({
        status: 200,
        contentType: "model/gltf-binary",
        body: "not a GLB",
        headers: { "Access-Control-Allow-Origin": origin },
      });
    return route.fulfill({
      status: 200,
      contentType: "model/gltf-binary",
      headers: { "Access-Control-Allow-Origin": origin },
      body: mode === "empty" ? emptyGLB() : bytes,
    });
  });
  report.renderDiagnostic =
    "Same real R2 GLB bytes, Playwright-only Access-Control-Allow-Origin; does not close hosted/direct CORS gate";
  p.on("request", (r) => requests.push(r.url()));
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  p.on("response", (r) => {
    if (r.url().includes("/showcase-assets/draco/"))
      media.push(
        (async () => ({
          url: r.url(),
          status: r.status(),
          contentType: r.headers()["content-type"],
          bytes: Number(r.headers()["content-length"]) || null,
        }))(),
      );
  });
  await p.goto(origin + "/showcase/experience?tenant=demo&part=6&chapter=0", {
    waitUntil: "domcontentloaded",
  });
  await p.waitForFunction(
    () => !!document.querySelector(".showcase__experience"),
  );
  report.loadingDOM = await p
    .locator(".showcase__experience")
    .evaluate((node) => ({
      display: getComputedStyle(node).display,
      height: node.getBoundingClientRect().height,
      text: node.innerText,
    }));
  save();
  await p
    .getByRole("status")
    .filter({ hasText: "Loading the product…" })
    .waitFor();
  report.cases.push({
    case: "explicit suspense/loading",
    visible: true,
    canvasBeforeReady: await p.locator("canvas").count(),
  });
  assert.equal(await p.locator("canvas").count(), 0);
  mode = "good";
  release();
  const ready = async (page) => {
    await page
      .getByRole("status")
      .filter({ hasText: "The product is ready to explore." })
      .waitFor({ timeout: 45000 });
    await page.waitForFunction(() =>
      window.__showcaseAudit.contexts.some(
        (c) => !c.lost && c.indexedElements > 0,
      ),
    );
  };
  await ready(p);
  await p.waitForTimeout(300);
  const initial = usage(requests);
  report.routes["/showcase/experience"] = {
    jsChunks: initial,
    jsBytes: initial.reduce((n, c) => n + (byName.get(c)?.bytes ?? 0), 0),
    gzipBytes: initial.reduce((n, c) => n + (byName.get(c)?.gzipBytes ?? 0), 0),
    heavyChunksRequested: initial.filter((c) => heavy.includes(c)),
  };
  assert.equal(
    report.routes["/showcase/experience"].heavyChunksRequested.length,
    heavy.length,
  );
  assert.ok(!requests.some((u) => u.includes("gstatic")));
  const snapshot = () =>
    p.evaluate(() => ({ scrollY: scrollY, ...window.__showcaseAudit }));
  const loaded = await snapshot();
  report.lifecycle = { loaded };
  save();
  assert.equal(loaded.workersCreated, loaded.workersTerminated);
  assert.ok(loaded.workersCreated > 0);
  await p.setViewportSize({ width: 1024, height: 768 });
  await p.waitForTimeout(500);
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.waitForTimeout(500);
  const resized = await snapshot();
  assert.equal(resized.contexts.length, loaded.contexts.length);
  assert.equal(resized.workersCreated, loaded.workersCreated);
  assert.equal(resized.contexts.at(-1).lost, false);
  assert.ok(resized.contexts.at(-1).deletedWhileLive.Framebuffer > 0);
  assert.ok(
    resized.contexts.at(-1).renderTargetTextures >
      resized.contexts.at(-1).renderTargetTexturesDeletedWhileLive,
  );
  report.cases.push({
    case: "composer resize reuses renderer/model and releases replaced targets",
    audit: resized,
  });
  await p.emulateMedia({ reducedMotion: "reduce" });
  await p.waitForFunction(
    () =>
      document
        .querySelector(".showcase__experience")
        ?.getAttribute("data-motion") === "reduced",
  );
  await p.waitForTimeout(500);
  const paused = await snapshot();
  await p.waitForTimeout(300);
  const still = await snapshot();
  assert.equal(still.contexts.at(-1).draws, paused.contexts.at(-1).draws);
  assert.equal(still.workersCreated, loaded.workersCreated);
  const reducedGL = still.contexts.at(-1);
  assert.equal(reducedGL.lost, false);
  assert.equal(
    reducedGL.renderTargetTexturesDeletedWhileLive,
    reducedGL.renderTargetTextures,
    "live reduced-motion toggle releases all composer targets without closing the model context",
  );
  assert.equal(
    reducedGL.deletedWhileLive.Framebuffer,
    reducedGL.created.Framebuffer,
  );
  await p.emulateMedia({ reducedMotion: "no-preference" });
  await p.waitForFunction(
    (count) => window.__showcaseAudit.contexts.at(-1).draws > count,
    still.contexts.at(-1).draws,
  );
  report.cases.push({
    case: "live reduced-motion toggle",
    sameModelAndContext: true,
    continuousFramesStopAndResume: true,
  });

  // Measure scene transitions within this document, NOT just final route exit.
  const sceneSnapshot = async () =>
    p.evaluate(() => ({
      scene: document.querySelector(".showcase__experience")?.dataset
        .activeScene,
      localProgress: Number(
        document.querySelector(".showcase__story")?.dataset.progress,
      ),
      lenisActive: document.documentElement.classList.contains("lenis"),
      stickyTop: document
        .querySelector(".showcase__sticky")
        ?.getBoundingClientRect().top,
      ...window.__showcaseAudit,
    }));
  const scrub = async (index, local) => {
    // Use the real scene control first: it stops an in-flight Lenis wheel tween.
    // Direct scrollTo during that tween is deliberately superseded by Lenis.
    await p
      .getByRole("button", {
        name: sceneTitles[index],
        exact: true,
      })
      .click();
    await p.evaluate(
      ({ index, local, count }) => {
        const node = document.querySelector(".showcase__experience");
        window.scrollTo(
          0,
          node.getBoundingClientRect().top +
            scrollY +
            ((index + local) / count) * (node.offsetHeight - innerHeight),
        );
      },
      { index, local, count: sceneCount },
    );
    await p.waitForFunction(
      ({ index, local }) => {
        const node = document.querySelector(".showcase__story");
        return (
          node?.dataset.scene === `showcase-scene-${index + 1}` &&
          Math.abs(Number(node.dataset.progress) - local) < 0.01
        );
      },
      { index, local },
    );
    await ready(p);
    await p.waitForTimeout(1400);
    return sceneSnapshot();
  };
  const near = await scrub(0, 0.15),
    far = await scrub(0, 0.75);
  const cameraNear = near.contexts.at(-1).cameraPosition,
    cameraFar = far.contexts.at(-1).cameraPosition;
  assert.ok(
    cameraNear && cameraFar,
    "actual GPU view matrices must be sampled",
  );
  assert.ok(Math.hypot(...cameraFar.map((v, i) => v - cameraNear[i])) > 0.5);
  // Authored crane second segment at .75 = [-.15, .175, 5.4].
  assert.ok(
    Math.hypot(...cameraFar.map((v, i) => v - [-0.15, 0.175, 5.4][i])) < 0.03,
  );
  assert.ok(far.localProgress > near.localProgress);
  assert.equal(far.lenisActive, true);
  assert.ok(Math.abs(far.stickyTop) < 2);
  report.choreography = {
    near,
    far,
    cameraFromGPUViewUniform: true,
    correctCranePose: true,
  };
  report.transitions = [];
  let previous = far;
  for (const [index, local] of [
    ...Array.from({ length: sceneCount - 1 }, (_, i) => [i + 1, 0.4]),
    ...Array.from({ length: sceneCount - 1 }, (_, i) => [
      sceneCount - 2 - i,
      0.6,
    ]),
    [sceneCount - 1, 0.7],
    [0, 0.2],
  ]) {
    const current = await scrub(index, local);
    const oldContext = current.contexts[previous.contexts.length - 1];
    assert.equal(
      current.contexts.length,
      previous.contexts.length + 1,
      "one fresh context per scene lease",
    );
    assert.equal(oldContext.lost, true, "old context lost at scene exit");
    for (const kind of ["Texture", "Buffer", "Program"])
      assert.ok(
        oldContext.deleted[kind] > 0,
        `${kind} released at scene transition`,
      );
    assert.ok(
      oldContext.created.Framebuffer > 0,
      "composer actually allocated framebuffers",
    );
    assert.equal(
      oldContext.deletedWhileLive.Framebuffer,
      oldContext.created.Framebuffer,
      "every composer framebuffer explicitly deleted before context loss",
    );
    assert.equal(
      oldContext.renderTargetTexturesDeletedWhileLive,
      oldContext.renderTargetTextures,
      "every attached render-target texture deleted before context loss",
    );
    assert.ok(oldContext.renderTargetTextures > 0);
    assert.equal(
      oldContext.deletedWhileLive.Renderbuffer ?? 0,
      oldContext.created.Renderbuffer ?? 0,
    );
    assert.ok(current.bitmapsClosed > previous.bitmapsClosed);
    assert.equal(current.workersCreated, current.workersTerminated);
    assert.equal(current.blobsCreated, current.blobsRevoked);
    assert.ok(current.contexts.slice(0, -1).every((c) => c.lost));
    assert.equal(current.contexts.at(-1).lost, false);
    const angle =
      Math.PI / 2 + (index - 1) * 2 + local * sceneDurations[index] * 0.08;
    const expectedCamera =
      index > 0
        ? [Math.cos(angle) * 5.2, 0.05, Math.sin(angle) * 5.2]
        : local < 0.5
          ? [-1.2 + 1.8 * local, 0.8 - local, 6.4 - 1.6 * local]
          : [
              -0.3 + 0.6 * (local - 0.5),
              0.3 - 0.5 * (local - 0.5),
              5.6 - 0.8 * (local - 0.5),
            ];
    assert.ok(
      Math.hypot(
        ...current.contexts
          .at(-1)
          .cameraPosition.map((v, i) => v - expectedCamera[i]),
      ) < 0.03,
      "actual camera follows this scene's authored crane/orbit",
    );
    report.transitions.push({
      from: previous.scene,
      to: current.scene,
      oldContext,
      bitmapsClosedDelta: current.bitmapsClosed - previous.bitmapsClosed,
      workersCreated: current.workersCreated,
      workersTerminated: current.workersTerminated,
      blobsCreated: current.blobsCreated,
      blobsRevoked: current.blobsRevoked,
      liveContexts: current.contexts.filter((c) => !c.lost).length,
      cameraPosition: current.contexts.at(-1).cameraPosition,
      expectedCamera,
    });
    await p.screenshot({
      path: path.join(out, `scene-${index + 1}-desktop.jpg`),
    });
    previous = current;
    save();
  }
  // The closing scene is a full owned view; its real CTA must exit through Next.
  await scrub(sceneCount - 1, 0.65);
  await p.getByRole("link", { name: "Continue", exact: true }).click();
  await p.waitForURL(
    (u) => u.pathname === "/" && u.searchParams.get("tenant") === "demo",
  );
  await p.waitForFunction(() =>
    window.__showcaseAudit.contexts.every((c) => c.lost),
  );
  const completed = await snapshot();
  for (const gl of completed.contexts) {
    assert.equal(
      gl.renderTargetTextures,
      gl.renderTargetTexturesDeletedWhileLive,
    );
    assert.equal(gl.created.Framebuffer, gl.deletedWhileLive.Framebuffer);
  }
  assert.equal(completed.workersCreated, completed.workersTerminated);
  report.completion = { tenant: "demo", pathname: "/", audit: completed };
  report.cases.push({
    case: "scene 12 Continue → tenant home releases model and composer",
    passed: true,
  });
  await p.goBack();
  await ready(p);
  await p.waitForFunction(
    () =>
      document.querySelector(".showcase__experience")?.dataset.activeScene ===
      "showcase-scene-12",
  );
  await ready(p);
  // Consent bridge uses the existing contract; no audio even after acceptance.
  const choices = [];
  await c.route("**/api/consent?tenant=demo", async (r) => {
    choices.push(JSON.parse(r.request().postData()));
    await r.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"ok":true}',
    });
  });
  await p
    .getByRole("button", { name: "Cookie preferences", exact: true })
    .click();
  await p
    .getByRole("button", { name: "Accept analytics", exact: true })
    .click();
  await p
    .getByText("Audio unavailable in this preview · consent accepted", {
      exact: true,
    })
    .waitFor();
  await p
    .getByRole("button", { name: "Cookie preferences", exact: true })
    .click();
  await p.getByRole("button", { name: "Essential only", exact: true }).click();
  await p
    .getByText("Audio unavailable in this preview · consent rejected", {
      exact: true,
    })
    .waitFor();
  assert.deepEqual(
    choices.map((c) => c.choice),
    ["accepted", "rejected"],
  );
  const audioAudit = await p.evaluate(() => window.__showcaseAudit);
  assert.equal(audioAudit.audioContexts, 0);
  assert.equal(audioAudit.mediaPlayCalls, 0);
  assert.ok(
    !requests.some((u) => /\.(?:mp3|mp4|ogg|wav|aac|m4a)(?:[?#]|$)/i.test(u)),
  );
  report.consentBridge = {
    audioContexts: 0,
    mediaPlayCalls: 0,
    choices,
    audio: "stubbed; no playback/media requests",
  };
  save();

  await p.screenshot({ path: path.join(out, "opening-desktop.jpg") });
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(400);
  await p.evaluate(() => {
    window.__wheelTrail = [];
    const start = performance.now();
    const record = () => {
      window.__wheelTrail.push({ time: performance.now() - start, y: scrollY });
      if (performance.now() - start < 1800) requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  });
  await p.mouse.wheel(0, 700);
  await p.waitForFunction(() => scrollY > 600);
  await p.waitForTimeout(1900);
  const wheelTrail = await p.evaluate(() => window.__wheelTrail);
  assert.ok(
    new Set(wheelTrail.map((s) => Math.round(s.y))).size > 3,
    "Lenis smooths wheel across multiple frames",
  );
  report.choreography.wheelTrail = wheelTrail;
  // Restore a later scene, not merely the opening scroll position.
  await scrub(2, 0.4);
  const before = await snapshot();
  await p.getByRole("link", { name: "Vehicles", exact: true }).click();
  await p.waitForURL((u) => u.pathname === "/vehicles");
  await p.waitForFunction(() =>
    window.__showcaseAudit.contexts.every((c) => c.lost),
  );
  const disposed = await snapshot();
  assert.equal(await p.locator("canvas").count(), 0);
  assert.ok(disposed.bitmapsClosed >= 1);
  assert.ok(
    disposed.contexts.some(
      (c) => c.deleted.Texture > 0 && c.deleted.Buffer > 0,
    ),
  );
  assert.equal(disposed.workersCreated, disposed.workersTerminated);
  assert.equal(
    await p.evaluate(() =>
      document.documentElement.classList.contains("lenis"),
    ),
    false,
  );
  report.lifecycle = { loaded, disposed };
  save();
  await p.goBack();
  await ready(p);
  await p.waitForFunction(() => scrollY > 600);
  await p.waitForFunction(
    () =>
      document.querySelector(".showcase__experience")?.dataset.activeScene ===
      "showcase-scene-3",
  );
  await ready(p);
  const back = await snapshot();
  assert.ok(Math.abs(back.scrollY - before.scrollY) < 100);
  report.lifecycle.back = back;
  report.lifecycle.backScene = await p
    .locator(".showcase__experience")
    .getAttribute("data-active-scene");
  await p.reload({ waitUntil: "domcontentloaded" });
  await ready(p);
  await p.waitForFunction(() => scrollY > 600);
  await p.waitForFunction(
    () =>
      document.querySelector(".showcase__experience")?.dataset.activeScene ===
      "showcase-scene-3",
  );
  await ready(p);
  report.lifecycle.refresh = await snapshot();
  report.lifecycle.refreshScene = await p
    .locator(".showcase__experience")
    .getAttribute("data-active-scene");
  assert.ok(Math.abs(report.lifecycle.refresh.scrollY - before.scrollY) < 100);
  await p.getByRole("link", { name: "Showcase", exact: true }).click();
  await p.waitForURL((u) => u.pathname === "/showcase");
  await p.waitForFunction(() =>
    window.__showcaseAudit.contexts.every((c) => c.lost),
  );
  await p.getByRole("link", { name: "Enter showcase", exact: true }).click();
  await p.waitForURL((u) => u.pathname === "/showcase/intro");
  await p.getByRole("link", { name: "Play", exact: true }).click();
  await ready(p);
  report.cases.push({ case: "landing → intro → experience", passed: true });
  report.successfulRender = { pageErrors: errors, consoleErrors };
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
  report.decoderRequests = await Promise.all(media);
  assert.ok(
    report.decoderRequests.some(
      (r) => r.url.endsWith(".wasm") && r.status === 200,
    ),
  );
  await c.close();
  const statesContext = await context();
  let bad = true;
  await statesContext.route(modelUrl, (r) =>
    r.fulfill({
      status: 200,
      contentType: "model/gltf-binary",
      headers: { "Access-Control-Allow-Origin": origin },
      body: bad ? "invalid" : bytes,
    }),
  );
  const states = await statesContext.newPage();
  await states.goto(origin + "/showcase/experience?tenant=demo");
  await states
    .getByRole("alert")
    .filter({ hasText: "The 3D view is unavailable" })
    .waitFor();
  bad = false;
  await states.getByRole("button", { name: "Try again", exact: true }).click();
  await ready(states);
  report.cases.push({ case: "model error → retry → rendered", passed: true });
  await statesContext.close();
  const emptyContext = await context();
  await emptyContext.route(modelUrl, (r) =>
    r.fulfill({
      status: 200,
      contentType: "model/gltf-binary",
      headers: { "Access-Control-Allow-Origin": origin },
      body: emptyGLB(),
    }),
  );
  const empty = await emptyContext.newPage();
  await empty.goto(origin + "/showcase/experience?tenant=demo");
  await empty
    .getByRole("alert")
    .filter({ hasText: "No 3D view is available" })
    .waitFor();
  assert.equal(await empty.locator("canvas").count(), 0);
  report.cases.push({ case: "empty GLB", passed: true });
  await emptyContext.close();
  const reducedContext = await context({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await reducedContext.route(modelUrl, (r) =>
    r.fulfill({
      status: 200,
      contentType: "model/gltf-binary",
      headers: { "Access-Control-Allow-Origin": origin },
      body: bytes,
    }),
  );
  const reduced = await reducedContext.newPage();
  await reduced.goto(origin + "/showcase/experience?tenant=demo");
  await ready(reduced);
  assert.equal(
    await reduced.locator(".showcase__experience").getAttribute("data-motion"),
    "reduced",
  );
  await reduced.waitForTimeout(500);
  const draws = await reduced.evaluate(
    () => window.__showcaseAudit.contexts[0].draws,
  );
  await reduced.waitForTimeout(300);
  assert.equal(
    await reduced.evaluate(() => window.__showcaseAudit.contexts[0].draws),
    draws,
  );
  for (const name of [...sceneTitles.slice(1), sceneTitles[0]]) {
    const old = await reduced.evaluate(() =>
      structuredClone(window.__showcaseAudit),
    );
    await reduced.getByRole("button", { name, exact: true }).click();
    await reduced.getByRole("heading", { name, exact: true }).waitFor();
    await ready(reduced);
    await reduced.waitForTimeout(700);
    const now = await reduced.evaluate(() => window.__showcaseAudit);
    assert.equal(now.contexts.length, old.contexts.length + 1);
    assert.equal(now.contexts.at(-2).lost, true);
    assert.ok(now.bitmapsClosed > old.bitmapsClosed);
    assert.equal(
      await reduced.evaluate(() =>
        document.documentElement.classList.contains("lenis"),
      ),
      false,
    );
    await reduced.screenshot({
      path: path.join(out, name.toLowerCase() + "-mobile-reduced.jpg"),
    });
  }
  const mobileReducedGL = await reduced.evaluate(
    () => window.__showcaseAudit.contexts,
  );
  assert.ok(
    mobileReducedGL.every(
      (c) => !c.created.Framebuffer && c.renderTargetTextures === 0,
    ),
    "reduced-motion scenes never allocate composer targets",
  );
  report.reducedMotion = { noComposerTargets: true, contexts: mobileReducedGL };
  await reduced.screenshot({
    path: path.join(out, "opening-mobile-reduced.jpg"),
  });
  report.cases.push({
    case: "reduced motion",
    continuousFrames: false,
    viewport: { width: 390, height: 844 },
  });
  await reducedContext.close();
  const unsupportedContext = await context();
  await unsupportedContext.addInitScript(() =>
    Object.defineProperty(window, "WebAssembly", {
      value: undefined,
      configurable: true,
    }),
  );
  const unsupported = await unsupportedContext.newPage(),
    unsupportedRequests = [];
  unsupported.on("request", (r) => unsupportedRequests.push(r.url()));
  await unsupported.goto(origin + "/showcase/experience?tenant=demo");
  await unsupported
    .getByText(
      "This view needs WebGL and WebAssembly. Product information and navigation remain available.",
      { exact: true },
    )
    .waitFor();
  assert.equal(await unsupported.locator("canvas").count(), 0);
  assert.ok(!unsupportedRequests.includes(modelUrl));
  report.cases.push({
    case: "WebAssembly unavailable",
    fallback: true,
    modelNotRequested: true,
  });
  await unsupportedContext.close();

  const noglContext = await context();
  await noglContext.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args) {
      return String(args[0]).includes("webgl")
        ? null
        : original.apply(this, args);
    };
  });
  await noglContext.route(modelUrl, (r) =>
    r.fulfill({
      status: 200,
      contentType: "model/gltf-binary",
      headers: { "Access-Control-Allow-Origin": origin },
      body: bytes,
    }),
  );
  const nogl = await noglContext.newPage();
  await nogl.goto(origin + "/showcase/experience?tenant=demo");
  await nogl
    .getByRole("alert")
    .filter({ hasText: "The 3D view is unavailable" })
    .waitFor();
  await nogl.waitForFunction(() => window.__showcaseAudit.bitmapsClosed >= 1);
  report.cases.push({
    case: "WebGL initialization failure",
    fallback: true,
    audit: await nogl.evaluate(() => window.__showcaseAudit),
  });
  await noglContext.close();

  // Abort while Three is still initializing its decoder, then let its static
  // fetch complete. The pinned guard must tear down any late worker/resources.
  const cancelledContext = await context();
  await cancelledContext.route(modelUrl, (r) =>
    r.fulfill({
      status: 200,
      contentType: "model/gltf-binary",
      headers: { "Access-Control-Allow-Origin": origin },
      body: bytes,
    }),
  );
  let releaseDecoder;
  const decoderGate = new Promise((r) => (releaseDecoder = r));
  await cancelledContext.route(
    "**/showcase-assets/draco/**/*.wasm",
    async (r) => {
      await decoderGate;
      await r.fulfill({
        status: 200,
        contentType: "application/wasm",
        body: fs.readFileSync(
          path.join(
            web,
            "public/showcase-assets/draco/three-0.164.1/draco_decoder.wasm",
          ),
        ),
      });
    },
  );
  const cancelled = await cancelledContext.newPage();
  const decoderRequested = cancelled.waitForRequest((r) =>
    r.url().endsWith("draco_decoder.wasm"),
  );
  await cancelled.goto(origin + "/showcase/experience?tenant=demo");
  await decoderRequested;
  await cancelled.getByRole("link", { name: "Home", exact: true }).click();
  await cancelled.waitForURL((u) => u.pathname === "/");
  releaseDecoder();
  await cancelled.waitForFunction(() => {
    const a = window.__showcaseAudit;
    return (
      a.workersCreated > 0 &&
      a.workersCreated === a.workersTerminated &&
      a.blobsCreated === a.blobsRevoked &&
      a.bitmapsClosed >= 1
    );
  });
  const cancellation = await cancelled.evaluate(() => window.__showcaseAudit);
  assert.equal(cancellation.contexts.length, 0);
  report.cases.push({
    case: "navigation during decoder initialization",
    passed: true,
    audit: cancellation,
  });
  await cancelledContext.close();
  // Cancel a pending parse by changing SCENE, while keeping the route mounted.
  const sceneCancelContext = await context();
  await sceneCancelContext.route(modelUrl, (r) =>
    r.fulfill({
      status: 200,
      contentType: "model/gltf-binary",
      body: bytes,
      headers: { "Access-Control-Allow-Origin": origin },
    }),
  );
  let allowSceneDecoder;
  const sceneDecoderGate = new Promise((r) => {
    allowSceneDecoder = r;
  });
  await sceneCancelContext.route(
    "**/showcase-assets/draco/**/*.wasm",
    async (r) => {
      await sceneDecoderGate;
      await r.fulfill({
        status: 200,
        contentType: "application/wasm",
        body: fs.readFileSync(
          path.join(
            web,
            "public/showcase-assets/draco/three-0.164.1/draco_decoder.wasm",
          ),
        ),
      });
    },
  );
  const sceneCancel = await sceneCancelContext.newPage();
  const firstDecoder = sceneCancel.waitForRequest((r) =>
    r.url().endsWith("draco_decoder.wasm"),
  );
  await sceneCancel.goto(origin + "/showcase/experience?tenant=demo");
  await firstDecoder;
  await sceneCancel
    .getByRole("button", { name: "Signal", exact: true })
    .click();
  await sceneCancel.waitForFunction(
    () =>
      document.querySelector(".showcase__experience")?.dataset.activeScene ===
      "showcase-scene-2",
  );
  allowSceneDecoder();
  await ready(sceneCancel);
  await sceneCancel.waitForFunction(() => {
    const a = window.__showcaseAudit;
    return (
      a.workersCreated >= 2 &&
      a.workersCreated === a.workersTerminated &&
      a.blobsCreated === a.blobsRevoked &&
      a.bitmapsClosed >= 1
    );
  });
  const sceneCancellation = await sceneCancel.evaluate(
    () => window.__showcaseAudit,
  );
  assert.equal(sceneCancellation.contexts.filter((c) => !c.lost).length, 1);
  report.cases.push({
    case: "scene exit during decoder initialization",
    passed: true,
    audit: sceneCancellation,
  });
  await sceneCancelContext.close();
  const nojsContext = await context({ javaScriptEnabled: false }),
    nojs = await nojsContext.newPage();
  for (const route of [
    "/showcase",
    "/showcase/intro",
    "/showcase/experience",
  ]) {
    await nojs.goto(origin + route + "?tenant=demo");
    assert.equal(await nojs.locator("h1").count(), 1);
    await nojs
      .getByRole("link", { name: "Explore products", exact: true })
      .waitFor();
    assert.equal(await nojs.locator("canvas").count(), 0);
    if (route === "/showcase/experience") {
      await nojs.getByRole("link", { name: "Continue", exact: true }).waitFor();
      assert.equal(
        await nojs
          .getByRole("link", { name: "Continue", exact: true })
          .getAttribute("href"),
        "/?tenant=demo",
      );
      assert.equal(
        await nojs.locator("noscript section section h2").count(),
        sceneCount,
      );
    }
  }
  await nojs.screenshot({ path: path.join(out, "nojs-experience.jpg") });
  report.cases.push({
    case: "JavaScript disabled",
    routes: 3,
    headingAndNoscriptNavigation: true,
  });
  await nojsContext.close();
  report.hydrationErrors.push(
    ...errors.filter((e) => /hydration|server.rendered/i.test(e)),
  );
  assert.deepEqual(report.hydrationErrors, []);
  assert.deepEqual(report.unhandledErrors, []);
  assert.ok(!/ReferenceError: (window|document)/.test(serverLogs));
  report.openGates.push(
    "Physical iOS/Android GPU/performance, source-video/product-choice overlay parity and audio remain 5d/5e work; all 12 numbered scenes are present",
  );
  save();
  console.log(
    JSON.stringify(
      {
        cases: report.cases,
        lifecycle: report.lifecycle,
        heavyChunks: report.bundle.heavyChunks,
        directR2: report.r2.browser.directAccess,
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
