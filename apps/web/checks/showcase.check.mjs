import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { showcaseModelUrl } from "../server/showcase/media.ts";
import { inspectBoundaries } from "../scripts/check-boundaries.mjs";

test("showcase media uses only an explicit public HTTPS binding and one real catalog asset", () => {
  assert.equal(showcaseModelUrl(undefined), null);
  assert.equal(
    showcaseModelUrl("https://preview.r2.dev/"),
    "https://preview.r2.dev/vehicle%20images/3D%20assets/blackredbull6.optimized.glb",
  );
  for (const base of [
    "http://untrusted.test",
    "file:///private",
    "https://name:secret@preview.r2.dev",
    "https://preview.r2.dev/?secret=x",
    "https://preview.r2.dev/#x",
  ])
    assert.throws(() => showcaseModelUrl(base));
});
test("3D dependencies are permitted only inside the explicitly client-owned spike", () => {
  const root = mkdtempSync(join(tmpdir(), "lume-showcase-boundaries-"));
  try {
    for (const dir of ["app", "server", "components/showcase-poc", "config"])
      mkdirSync(join(root, dir), { recursive: true });
    const target = join(root, "components/showcase-poc/Scene.tsx");
    writeFileSync(
      target,
      '"use client";import {Canvas} from "@react-three/fiber";import {useGLTF} from "@react-three/drei";import "three";import "lenis";',
    );
    assert.deepEqual(inspectBoundaries(root), []);
    writeFileSync(target, 'import "three";');
    assert.ok(
      inspectBoundaries(root).some((e) =>
        e.includes("unapproved runtime package three"),
      ),
    );
    writeFileSync(target, '"use client";import "leva";');
    assert.ok(
      inspectBoundaries(root).some((e) =>
        e.includes("unapproved runtime package leva"),
      ),
    );
    writeFileSync(
      target,
      '"use client";import "three";import "../../server/private";',
    );
    writeFileSync(join(root, "server/private.ts"), 'import "server-only";');
    assert.ok(
      inspectBoundaries(root).some((e) =>
        e.includes("client graph reaches server"),
      ),
    );
    writeFileSync(target, '"use client";import "three";');
    writeFileSync(
      join(root, "server/bad.ts"),
      'import "../components/showcase-poc/Scene";',
    );
    assert.ok(
      inspectBoundaries(root).some((e) =>
        e.includes("server graph reaches a client"),
      ),
    );
    writeFileSync(join(root, "app/bad.tsx"), 'import "three";');
    writeFileSync(
      join(root, "components/unrelated.tsx"),
      '"use client";import "lenis";',
    );
    const errors = inspectBoundaries(root);
    assert.ok(
      errors.some((e) =>
        e.startsWith("app/bad.tsx: unapproved runtime package"),
      ),
    );
    assert.ok(
      errors.some((e) =>
        e.startsWith("components/unrelated.tsx: unapproved runtime package"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("disposable route retains a client dynamic ssr:false boundary with no root Vite imports", () => {
  const loader = readFileSync(
    new URL("../components/showcase-poc/SceneIsland.tsx", import.meta.url),
    "utf8",
  );
  assert.match(loader, /^"use client"/);
  assert.match(loader, /ssr:\s*false/);
  const route = readFileSync(
    new URL("../app/showcase/page.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(!route.includes("src/"));
  assert.ok(!route.includes("@react-three"));
});
