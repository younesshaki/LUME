import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { DEFAULT_PAGES } from "@lume/blocks";
import { getSiteTemplate, normalizeSiteDesign } from "@lume/types";
const root = fileURLToPath(new URL("..", import.meta.url));
const id = "2de52a45-bc2b-451c-994c-02208b994e26";
let scenario = "published";
const calls = [];
const pageFor = (slug) => {
  const seed = DEFAULT_PAGES.find((p) => p.slug === slug);
  if (!seed && !["services", "our-story"].includes(slug)) return [];
  if (scenario === "missing") return [];
  const page = seed ?? {
    slug,
    title: slug === "services" ? "Services" : "Our story",
    seoMeta: {
      title: `Fixture ${slug}`,
      description: `Published ${slug} contract content.`,
    },
    blocks: {
      version: 1,
      blocks: [
        {
          id: `${slug}-hero`,
          type: "hero",
          props: {
            title: `Published ${slug}`,
            subtitle: "Public revision only.",
          },
        },
        {
          id: `${slug}-body`,
          type: "rich-text",
          props: {
            body: "Published body remains readable without JavaScript.",
          },
        },
      ],
    },
  };
  return [
    {
      id: `fixture-${slug}`,
      slug,
      title: page.title,
      seo_meta: page.seoMeta,
      published_revision_id: `published-${slug}`,
      blocks: scenario === "empty" ? { version: 1, blocks: [] } : page.blocks,
    },
  ];
};
const fixture = http.createServer(async (req, res) => {
  let body = "";
  for await (const c of req) body += c;
  const u = new URL(req.url, "http://fixture");
  assert.equal(req.headers.apikey, "fixture-anon");
  const args = body ? JSON.parse(body) : {};
  calls.push({ path: u.pathname, args });
  let value;
  if (u.pathname.endsWith("/tenant_by_slug"))
    value =
      args.p_slug === "demo"
        ? [{ id, slug: "demo", name: "Fixture Demo", status: "active" }]
        : [];
  else if (u.pathname.endsWith("/get_tenant_theme"))
    value = [{ theme: normalizeSiteDesign({}, getSiteTemplate("luxury")) }];
  else if (u.pathname.endsWith("/list_published_nav_pages")) value = [];
  else if (u.pathname.endsWith("/get_published_page")) {
    assert.equal(args.p_tenant_id, id);
    if (scenario === "error") {
      res.writeHead(503).end('{"private":"must not leak"}');
      return;
    }
    value = pageFor(args.p_slug);
  } else {
    res.writeHead(404).end();
    return;
  }
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(value));
});
await new Promise((r) => fixture.listen(0, "127.0.0.1", r));
const reservation = net.createServer();
await new Promise((r) => reservation.listen(0, "127.0.0.1", r));
const port = reservation.address().port;
await new Promise((r) => reservation.close(r));
const child = spawn(process.execPath, ["scripts/run.mjs", "start"], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    WEB_PREVIEW_TEST_MODE: "1",
    WEB_PREVIEW_SUPABASE_URL: `http://127.0.0.1:${fixture.address().port}`,
    WEB_PREVIEW_PROJECT_REF: "local-content-test",
    WEB_PREVIEW_SUPABASE_ANON_KEY: "fixture-anon",
    WEB_PREVIEW_SUPABASE_SERVICE_ROLE_KEY: "",
    WEB_PREVIEW_DEFAULT_TENANT: "demo",
    WEB_PREVIEW_UPSTREAM_ORIGIN: "",
    SUPABASE_SERVICE_ROLE_KEY: "forbidden-production-sentinel",
    R2_SECRET_ACCESS_KEY: "forbidden-r2-sentinel",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
child.stdout.on("data", (c) => (logs += c));
child.stderr.on("data", (c) => (logs += c));
const origin = `http://127.0.0.1:${port}`;
const evidence = [];
const out = `${root}/artifacts/content`;
await mkdir(out, { recursive: true });
async function request(path, headers = {}) {
 return new Promise((resolve,reject)=>{const req=http.request({hostname:"127.0.0.1",port,path,headers:{host:`127.0.0.1:${port}`,...headers}},res=>{let html="";res.setEncoding("utf8");res.on("data",c=>html+=c);res.on("end",()=>resolve({status:res.statusCode,headers:new Headers(Object.entries(res.headers).map(([k,v])=>[k,Array.isArray(v)?v.join(","):v])),html}));});req.setTimeout(20000,()=>req.destroy(new Error("Content fixture timeout")));req.on("error",reject);req.end();});
}

function checkDocument(result, path) {
  assert.equal(result.status, 200, path);
  const dom = new JSDOM(result.html).window.document;
  assert.equal(dom.querySelectorAll("h1").length, 1, path + " one h1");
  for (const selector of [
    "title",
    'meta[name="description"]',
    'link[rel="canonical"]',
    'meta[property="og:title"]',
    'meta[property="og:description"]',
    'meta[property="og:url"]',
  ])
    assert.equal(
      dom.head.querySelectorAll(selector).length,
      1,
      path + " " + selector,
    );
  assert.match(dom.querySelector('meta[name="robots"]').content, /noindex/);
  assert.match(result.headers.get("cache-control"), /no-store/);
  assert.match(result.headers.get("x-robots-tag"), /noindex/);
  const canonical = new URL(dom.querySelector('link[rel="canonical"]').href);
  assert.equal(canonical.searchParams.get("template"), null);
  assert.equal(canonical.searchParams.get("theme"), null);
  assert.equal(canonical.searchParams.get("tenant"), "demo");
  assert.ok(!result.html.includes("forbidden-production-sentinel"));
  return dom;
}
try {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await request("/robots.txt");
      if (r.status === 200) break;
    } catch {}
    if (i === 99) throw new Error("Next not ready");
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.match(logs, /genericProductionBindingCount":0/);
  for (const template of ["luxury", "glo3d"])
    for (const mode of ["light", "dark"])
      for (const slug of ["", "contact", "products", "services", "our-story"]) {
        const path = `/${slug}?tenant=demo&template=${template}&theme=${mode}`;
        const result = await request(path);
        const dom = checkDocument(result, path);
        assert.equal(
          dom.querySelector("[data-content-state]")?.dataset.contentState,
          "published",
        );
        assert.equal(dom.documentElement.dataset.lumeTemplate, template);
        assert.equal(dom.documentElement.dataset.theme, mode);
        await writeFile(
          `${out}/${template}-${mode}-${slug || "home"}.html`,
          result.html,
        );
        evidence.push({
          scenario,
          template,
          mode,
          route: slug || "home",
          status: result.status,
          h1: dom.querySelector("h1").textContent,
          title: dom.title,
          canonical: dom.querySelector('link[rel="canonical"]').href,
        });
      }
  for (const state of ["missing", "empty"]) {
    scenario = state;
    for (const slug of ["", "contact", "products", "services", "our-story"]) {
      const path = `/${slug}?tenant=demo`;
      const r = await request(path);
      const expected =
        state === "missing" && ["services", "our-story"].includes(slug)
          ? 404
          : 200;
      assert.equal(r.status, expected);
      if (expected === 200) {
        const dom = checkDocument(r, path);
        assert.equal(
          dom.querySelector("[data-content-state]")?.dataset.contentState,
          state === "missing" ? "fallback" : "empty",
        );
        if (state === "empty" && slug === "our-story")
          assert.ok(!dom.body.textContent.includes("Public revision only"));
      }
      await writeFile(`${out}/${state}-${slug || "home"}.html`, r.html);
      evidence.push({ scenario, route: slug || "home", status: r.status });
    }
  }
  scenario = "published";
  for (const query of [
    "tenant=foreign",
    "tenant=demo&draft=1",
    "tenant=demo&revision=draft-secret",
    "tenant=demo&revisionId=draft-secret",
    "tenant=demo&previewToken=public-token",
    "tenant=demo&preview=1",
    "tenant=demo&tenant=foreign",
  ]) {
    const r = await request("/contact?" + query);
    assert.equal(r.status, 404, query);
    assert.ok(!r.html.includes("Public revision only"));
    evidence.push({ rejection: query, status: r.status });
  }
  for (const headers of [
    { host: "forged.invalid" },
    { "x-forwarded-host": "forged.invalid" },
    { "x-web-tenant": "foreign" },
  ]) {
    const r = await request("/contact?tenant=demo", headers);
    assert.equal(r.status, 404);
    evidence.push({ rejection: Object.keys(headers)[0], status: r.status });
  }
  const overwritten = checkDocument(
    await request("/contact?tenant=demo", {
      "x-web-request-path": "/contact?tenant=foreign&draft=1",
    }),
    "overwritten request-path header",
  );
  assert.equal(
    overwritten.querySelector("[data-content-state]").dataset.contentState,
    "published",
  );
  await Promise.all(
    Array.from({ length: 24 }, async (_, i) => {
      const slug = i % 2 ? "foreign" : "demo";
      const r = await request(
        `/contact?tenant=${slug}`,
        i % 3 ? {} : { RSC: "1" },
      );
      if (slug === "foreign") {
        assert.ok(!r.html.includes("Luxury versions of everyday energy"));
        assert.ok(!r.html.includes("contact-form"));
        assert.ok(
          r.status === 404 || r.html.includes("NEXT_HTTP_ERROR_FALLBACK;404"),
        );
      } else assert.equal(r.status, 200);
    }),
  );
  scenario = "error";
  const failed = await request("/contact?tenant=demo");
  assert.equal(failed.status, 500);
  assert.ok(!failed.html.includes("must not leak"));
  assert.ok(!failed.html.includes('data-content-state="published"'));
  await writeFile(`${out}/error-contact.html`, failed.html);
  evidence.push({
    scenario,
    route: "contact",
    status: failed.status,
    privateDetailsLeaked: false,
  });
  assert.ok(
    calls.every((c) => !/(?:page_revisions|draft|\/pages$)/.test(c.path)),
  );
  await writeFile(
    `${out}/report.json`,
    JSON.stringify(
      {
        dataSource:
          "Local deterministic public-RPC double; no staging writes or fabricated remote tenants",
        requests: evidence,
        publicRpcPaths: [...new Set(calls.map((c) => c.path))],
        concurrentIsolationRequests: 24,
        productionBindingCount: 0,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `PASS published SSR: 20 template/mode/route documents; 10 fallback/empty routes; draft/host selectors, 24 concurrent isolation requests, sanitized HTTP500. Evidence: artifacts/content/`,
  );
} finally {
  child.kill("SIGTERM");
  await new Promise((r) => child.once("exit", r));
  fixture.closeAllConnections();
  await new Promise((r) => fixture.close(r));
}
