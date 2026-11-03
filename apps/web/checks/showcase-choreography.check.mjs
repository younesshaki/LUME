import test from "node:test";
import assert from "node:assert/strict";
import { showcaseAssets } from "../server/showcase/media.ts";
import {
  createStoryStore,
  sceneAt,
} from "../components/showcase/story-store.ts";
import { cameraAt } from "../components/showcase/camera-path.ts";
import { narrativeAt } from "../components/showcase/story-cues.ts";
import { createModelResource } from "../components/showcase/model-resource.ts";
import { Group, Mesh, BoxGeometry, MeshStandardMaterial, Texture } from "three";
import { scene1 } from "../../../src/experience/scenes/showcase/scenes/scene-1/content.ts";
import { scene2 } from "../../../src/experience/scenes/showcase/scenes/scene-2/content.ts";
import { scene3 } from "../../../src/experience/scenes/showcase/scenes/scene-3/content.ts";

import { scene4 } from "../../../src/experience/scenes/showcase/scenes/scene-4/content.ts";
import { scene5 } from "../../../src/experience/scenes/showcase/scenes/scene-5/content.ts";
import { scene6 } from "../../../src/experience/scenes/showcase/scenes/scene-6/content.ts";
import { scene7 } from "../../../src/experience/scenes/showcase/scenes/scene-7/content.ts";
import { scene8 } from "../../../src/experience/scenes/showcase/scenes/scene-8/content.ts";

const { scenes } = showcaseAssets("https://preview.r2.dev");
test("batch carries original first-eight narrative cues, with fixed scene-keyed assets", () => {
  for (const [index, source] of [
    scene1,
    scene2,
    scene3,
    scene4,
    scene5,
    scene6,
    scene7,
    scene8,
  ].entries()) {
    const scene = scenes[index];
    assert.equal(scene.id, source.id);
    assert.equal(scene.title, source.title);
    assert.equal(scene.duration, source.duration);
    assert.deepEqual(scene.lines, source.lines);
    assert.equal(new URL(scene.modelUrl).origin, "https://preview.r2.dev");
    assert.equal(new URL(scene.modelUrl).search, "");
  }
  assert.deepEqual(
    showcaseAssets("https://preview.r2.dev", {
      url: "https://forged.test/model.glb",
      scene: "private",
    }),
    { scenes },
  );
});
test("scene intervals are reversible and handle endpoints, skipped beats and invalid progress", () => {
  assert.deepEqual(sceneAt(0, 3), { index: 0, progress: 0, sceneProgress: 0 });
  assert.equal(sceneAt(1 / 3, 3).index, 1);
  assert.equal(sceneAt(0.9, 3).index, 2);
  assert.equal(sceneAt(0.1, 3).index, 0);
  assert.deepEqual(sceneAt(1, 3), { index: 2, progress: 1, sceneProgress: 1 });
  assert.deepEqual(sceneAt(NaN, 3), sceneAt(0, 3));
  assert.deepEqual(sceneAt(-4, 3), sceneAt(0, 3));
  assert.deepEqual(sceneAt(4, 3), sceneAt(1, 3));
});
test("tenant-local bridge shares state only with subscribers of that instance; audio always stubbed", () => {
  const a = createStoryStore(scenes[0].id),
    b = createStoryStore(scenes[0].id);
  let calls = 0;
  const stop = a.subscribe(() => calls++);
  a.update({
    sceneId: scenes[2].id,
    progress: 0.8,
    sceneProgress: 0.4,
    reduced: false,
  });
  assert.equal(calls, 1);
  assert.equal(b.getSnapshot().sceneId, scenes[0].id);
  assert.equal(b.getSnapshot().progress, 0);
  for (const consent of ["accepted", "rejected", null]) {
    a.update({ consent });
    assert.deepEqual(a.getSnapshot().audio, {
      status: "stubbed",
      enabled: false,
    });
    assert.equal(b.getSnapshot().consent, null);
  }
  const before = calls;
  stop();
  a.update({ progress: 0.2 });
  assert.equal(calls, before);
});
test("crane and orbit join continuously, reverse exactly, and produce finite distinct poses", () => {
  assert.deepEqual(cameraAt(scenes[0], 0), [-1.2, 0.8, 6.4]);
  assert.deepEqual(cameraAt(scenes[0], 0.5), [-0.3, 0.3, 5.6]);
  for (let i = 0; i < scenes.length - 1; i++) {
    const last = cameraAt(scenes[i], 1),
      next = cameraAt(scenes[i + 1], 0);
    assert.ok(last.every((v, j) => Math.abs(v - next[j]) < 1e-8));
  }
  for (const scene of scenes) {
    const sample = cameraAt(scene, 0.6);
    cameraAt(scene, 0.9);
    assert.deepEqual(cameraAt(scene, 0.6), sample);
    assert.notDeepEqual(cameraAt(scene, 0.1), sample);
    assert.ok(sample.every(Number.isFinite));
  }
});
test("narrative blank and flip cues scrub deterministically in both directions", () => {
  assert.equal(narrativeAt(scenes[0], 0), "");
  const later = narrativeAt(scenes[0], 0.98);
  assert.equal(later, "The brand story can now take its place.");
  assert.equal(narrativeAt(scenes[0], 0), "");
  assert.equal(narrativeAt(scenes[2], 0), "Reveal the product with restraint.");
  assert.match(narrativeAt(scenes[2], 0.1), /precision/);
  assert.equal(
    narrativeAt(scenes[2], 1),
    "The visitor should understand what matters first.",
  );
});
test("same-URL scene leases own and dispose distinct geometries/materials/textures on every transition", async () => {
  const leases = [];
  for (const scene of [...scenes, scenes[1], scenes[0]]) {
    if (leases.length) leases.at(-1).resource.dispose();
    const geometry = new BoxGeometry(),
      texture = new Texture({
        close() {
          counts.bitmap++;
        },
      });
    const material = new MeshStandardMaterial({ map: texture }),
      object = new Group();
    object.add(new Mesh(geometry, material));
    const counts = { geometry: 0, material: 0, texture: 0, bitmap: 0 };
    for (const [name, item] of Object.entries({ geometry, material, texture }))
      item.addEventListener("dispose", () => counts[name]++);
    const resource = createModelResource(scene.modelUrl, {
      load: async () => ({ scene: object, scenes: [object] }),
    });
    try {
      resource.read();
    } catch (pending) {
      await pending;
    }
    assert.equal(resource.status, "ready");
    assert.notEqual(resource.read().scene, leases.at(-1)?.object);
    leases.push({ resource, counts, object });
    for (const old of leases.slice(0, -1))
      assert.deepEqual(old.counts, {
        geometry: 1,
        material: 1,
        texture: 1,
        bitmap: 1,
      });
    assert.deepEqual(counts, {
      geometry: 0,
      material: 0,
      texture: 0,
      bitmap: 0,
    });
  }
  leases.at(-1).resource.dispose();
  for (const lease of leases)
    assert.deepEqual(lease.counts, {
      geometry: 1,
      material: 1,
      texture: 1,
      bitmap: 1,
    });
});
