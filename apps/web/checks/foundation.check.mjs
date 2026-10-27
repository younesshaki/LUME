import { test } from "node:test";
import assert from "node:assert/strict";
import {
  previewEnvironment,
  databaseConfiguration,
  assertPreviewEnvironment,
  PRODUCTION_PROJECT,
} from "../config/environment.ts";
import { resolveTenant, hostname } from "../server/resolver-core.ts";
import { inspectBoundaries } from "../scripts/check-boundaries.mjs";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tenants = {
  alpha: { tenantId: "a", slug: "alpha", name: "Alpha Motors" },
  beta: { tenantId: "b", slug: "beta", name: "Beta Cars" },
};
const repo = {
  bySlug: async (slug) => tenants[slug] ?? null,
  verifiedDomain: async (h) =>
    h === "dealer.example" ? { tenantId: "b", domain: h } : null,
};
const config = {
  previewHosts: ["localhost"],
  rootDomain: "lume.test",
  customHosts: { "dealer.example": "beta" },
};

test("environment allowlist strips inherited production bindings and Git tokens", () => {
  const env = previewEnvironment({
    PATH: "/usr/bin",
    SUPABASE_SERVICE_ROLE_KEY: "sentinel-private",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "sentinel-public",
    R2_SECRET_ACCESS_KEY: "sentinel-r2",
    GH_TOKEN: "sentinel-git",
  });
  assert.deepEqual(Object.keys(env).sort(), [
    "NEXT_TELEMETRY_DISABLED",
    "PATH",
    "WEB_PREVIEW_SANITIZED",
  ]);
  assert.throws(() => databaseConfiguration(env), /Dedicated staging/);
});
test("production deployments, database origins, and cross-project credentials fail closed", () => {
  assert.throws(
    () => previewEnvironment({ VERCEL_ENV: "production" }),
    /production deployment/,
  );
  assert.throws(
    () => previewEnvironment({ WEB_PREVIEW_TEST_MODE: "1", VERCEL: "1" }),
    /forbidden/,
  );
  assert.throws(
    () =>
      previewEnvironment({
        WEB_PREVIEW_SUPABASE_URL: `https://${PRODUCTION_PROJECT}.supabase.co`,
        WEB_PREVIEW_PROJECT_REF: PRODUCTION_PROJECT,
      }),
    /non-production/,
  );
  const jwt =
    "e30." +
    Buffer.from(
      JSON.stringify({ ref: PRODUCTION_PROJECT, role: "anon" }),
    ).toString("base64url") +
    ".sig";
  assert.throws(
    () =>
      previewEnvironment({
        WEB_PREVIEW_SUPABASE_URL: "https://stagingonly.supabase.co",
        WEB_PREVIEW_PROJECT_REF: "stagingonly",
        WEB_PREVIEW_SUPABASE_ANON_KEY: jwt,
      }),
    /mismatch/,
  );
});
test("hosted preview runtime validates its own bindings without a local launcher marker", () => {
  const hosted = {
    VERCEL: "1",
    VERCEL_ENV: "preview",
    WEB_PREVIEW_SUPABASE_URL: "https://stagingonly.supabase.co",
    WEB_PREVIEW_PROJECT_REF: "stagingonly",
    WEB_PREVIEW_SUPABASE_ANON_KEY: "sb_publishable_staging_fixture",
  };
  assert.equal(
    databaseConfiguration(hosted).url,
    "https://stagingonly.supabase.co",
  );
  assert.throws(
    () =>
      assertPreviewEnvironment({
        ...hosted,
        CRON_SECRET: "forbidden-hosted-secret",
      }),
    /Unisolated/,
  );
});
test("alternating concurrent requests never reuse a module-global tenant", async () => {
  const result = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      resolveTenant(
        { host: `${i % 2 ? "alpha" : "beta"}.lume.test` },
        config,
        repo,
      ),
    ),
  );
  result.forEach((r, i) => assert.equal(r.slug, i % 2 ? "alpha" : "beta"));
  assert.equal(result[0].canonical, "https://beta.lume.test/preview");
  assert.equal(
    (await resolveTenant({ host: "dealer.example" }, config, repo)).tenantId,
    "b",
  );
});
test("unknown, nested, reserved, duplicate, conflicting and forged selectors are rejected", async () => {
  for (const input of [
    { host: "attacker.example", selector: "alpha" },
    { host: "nested.alpha.lume.test" },
    { host: "www.lume.test" },
    { host: "unknown.lume.test" },
    { host: "localhost", selector: ["alpha", "beta"] },
    { host: "alpha.lume.test", selector: "beta" },
    { host: "localhost", selector: "alpha", internalSelector: "alpha" },
    { host: "localhost", selector: "alpha", forwardedHost: "attacker.example" },
    { host: "a@alpha.lume.test" },
  ])
    await assert.rejects(() => resolveTenant(input, config, repo));
  assert.throws(() => hostname("alpha.lume.test,attacker.example"));
});
test("unverified or mismatched custom-domain mappings fail closed", async () => {
  await assert.rejects(() =>
    resolveTenant({ host: "dealer.example" }, config, {
      ...repo,
      verifiedDomain: async () => null,
    }),
  );
  await assert.rejects(() =>
    resolveTenant({ host: "dealer.example" }, config, {
      ...repo,
      verifiedDomain: async () => ({ tenantId: "a", domain: "dealer.example" }),
    }),
  );
});
test("boundary checker detects indirect graph leaks and workspace escapes", () => {
  assert.deepEqual(inspectBoundaries(), []);
  const root = mkdtempSync(join(tmpdir(), "lume-web-boundaries-"));
  try {
    for (const dir of ["app", "server", "components", "config"])
      mkdirSync(join(root, dir));
    writeFileSync(join(root, "server", "entry.ts"), "import './bridge';");
    writeFileSync(
      join(root, "server", "bridge.ts"),
      "import '../components/view';",
    );
    writeFileSync(
      join(root, "components", "view.tsx"),
      "'use client';import '../server/entry';import '../../../src/App';export default function X(){return null}",
    );
    const errors = inspectBoundaries(root);
    assert.ok(errors.some((e) => e.includes("server graph reaches a client")));
    assert.ok(errors.some((e) => e.includes("client graph reaches server")));
    assert.ok(errors.some((e) => e.includes("escapes web workspace")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
