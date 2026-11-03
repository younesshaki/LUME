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
import { showcaseAssets } from "../server/showcase/media.ts";
import { inspectBoundaries } from "../scripts/check-boundaries.mjs";

test("showcase scene manifest uses only the explicit HTTPS binding and fixed server-owned keys", () => {
  assert.equal(showcaseAssets(undefined).scenes.length, 8);
  assert.ok(showcaseAssets(undefined).scenes.every((s) => s.modelUrl === null));
  assert.deepEqual(
    showcaseAssets(undefined).scenes.map((s) => s.id),
    Array.from({ length: 8 }, (_, i) => `showcase-scene-${i + 1}`),
  );
  assert.equal(
    showcaseAssets("https://preview.r2.dev/").scenes[0].modelUrl,
    "https://preview.r2.dev/vehicle%20images/3D%20assets/blackredbull6.optimized.glb",
  );
  for (const base of [
    "http://untrusted.test",
    "file:///private",
    "https://name:secret@preview.r2.dev",
    "https://preview.r2.dev/?secret=x",
    "https://preview.r2.dev/#x",
  ])
    assert.throws(() => showcaseAssets(base));
});
test("3D dependencies are permitted only inside the explicitly client-owned showcase", () => {
  const root = mkdtempSync(join(tmpdir(), "lume-showcase-boundaries-"));
  try {
    for (const dir of ["app", "server", "components/showcase", "config"])
      mkdirSync(join(root, dir), { recursive: true });
    const target = join(root, "components/showcase/Scene.tsx");
    writeFileSync(
      target,
      '"use client";import {Canvas} from "@react-three/fiber";import {useGLTF} from "@react-three/drei";import "three";import "lenis";import "gsap";import "@react-three/postprocessing";import "postprocessing";',
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
    writeFileSync(
      join(root, "config/private.ts"),
      'export const value = "fixture";',
    );
    writeFileSync(
      target,
      '"use client";import "three";import "../../config/private";',
    );
    assert.ok(
      inspectBoundaries(root).some((e) =>
        e.includes("client graph reaches server/config"),
      ),
    );
    writeFileSync(
      target,
      '"use client";import "three";process.env.PRIVATE_FIXTURE;',
    );
    assert.ok(
      inspectBoundaries(root).some((e) =>
        e.includes("client process access is forbidden"),
      ),
    );
    writeFileSync(target, '"use client";import "three";');
    writeFileSync(
      join(root, "server/bad.ts"),
      'import "../components/showcase/Scene";',
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
test("framework admits the requested future scene packages only inside the client-owned showcase", () => {
  assert.deepEqual(inspectBoundaries(), []);
});
