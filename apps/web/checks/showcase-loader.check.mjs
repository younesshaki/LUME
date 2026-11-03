import test from "node:test";
import assert from "node:assert/strict";
import {
  Group,
  Mesh,
  BoxGeometry,
  MeshStandardMaterial,
  Texture,
  ShaderMaterial,
} from "three";
import { createModelResource } from "../components/showcase/model-resource.ts";
import { disposeModel } from "../components/showcase/disposeModel.ts";
import {
  fetchModelBytes,
  guardDecoder,
  trackParseResources,
} from "../components/showcase/loadModel.ts";
import {
  validateGLB,
  MAX_MODEL_BYTES,
  EmptyModelError,
} from "../components/showcase/model-policy.ts";
import { parseShowcaseEntry } from "../server/showcase/entry.ts";
function asset() {
  const scene = new Group(),
    geometry = new BoxGeometry(),
    image = {
      closeCount: 0,
      close() {
        this.closeCount++;
      },
    },
    texture = new Texture(image),
    material = new MeshStandardMaterial({ map: texture });
  scene.add(new Mesh(geometry, material), new Mesh(geometry, material));
  return { scene, scenes: [scene], geometry, material, texture, image };
}
function glb(json = { asset: { version: "2.0" }, scenes: [{}] }) {
  const text = Buffer.from(JSON.stringify(json));
  const padded = Buffer.concat([
    text,
    Buffer.alloc((4 - (text.length % 4)) % 4, 32),
  ]);
  const buffer = new ArrayBuffer(20 + padded.length);
  const view = new DataView(buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, buffer.byteLength, true);
  view.setUint32(12, padded.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(buffer, 20).set(padded);
  return buffer;
}
const yieldTask = () => new Promise((r) => setTimeout(r, 0));
async function settled(resource) {
  try {
    resource.read();
  } catch (value) {
    if (value instanceof Promise) await value;
    else throw value;
  }
}
test("full model disposal deduplicates geometry/material/textures and closes owned image bitmaps", () => {
  const a = asset(),
    counts = { geometry: 0, material: 0, texture: 0 };
  for (const key of Object.keys(counts))
    a[key].addEventListener("dispose", () => counts[key]++);
  const uniforms = new ShaderMaterial({
    uniforms: { shared: { value: [a.texture, a.texture] } },
  });
  a.scene.add(new Mesh(a.geometry, uniforms));
  disposeModel(a);
  assert.deepEqual(counts, { geometry: 1, material: 1, texture: 1 });
  assert.equal(a.image.closeCount, 1);
});
test("ready resources release all GPU objects exactly once on repeated disposal", async () => {
  const a = asset();
  let calls = 0;
  a.geometry.addEventListener("dispose", () => calls++);
  const resource = createModelResource("https://model.test/asset.glb", {
    load: async () => a,
  });
  await settled(resource);
  assert.equal(resource.read().meshes, 2);
  assert.equal(resource.status, "ready");
  resource.dispose();
  resource.dispose();
  assert.equal(calls, 1);
  assert.equal(a.image.closeCount, 1);
  assert.equal(resource.status, "disposed");
  assert.throws(() => resource.read());
});
test("cancelled pending resources settle Suspense, abort requests and dispose a late parse result", async () => {
  const a = asset();
  let resolve, signal;
  const resource = createModelResource("https://model.test/asset.glb", {
    load: (_, s) => {
      signal = s;
      return new Promise((r) => (resolve = r));
    },
  });
  const wait = settled(resource);
  await yieldTask();
  resource.dispose();
  await wait;
  assert.equal(signal.aborted, true);
  resolve(a);
  await yieldTask();
  assert.equal(resource.status, "disposed");
  assert.equal(a.image.closeCount, 1);
});
test("timeout and parse errors settle to a retryable failure rather than hanging Suspense", async () => {
  const slow = createModelResource("https://model.test/asset.glb", {
    timeoutMs: 5,
    load: () => new Promise(() => {}),
  });
  await settled(slow);
  assert.equal(slow.status, "error");
  assert.throws(() => slow.read(), /timed out/);
  slow.dispose();
  const bad = createModelResource("https://model.test/asset.glb", {
    load: async () => {
      throw Error("decoder failure");
    },
  });
  await settled(bad);
  assert.throws(() => bad.read(), /decoder failure/);
  bad.dispose();
});
test("empty model has its own state and disposes even when preparation fails", async () => {
  const a = asset();
  a.scene.children.forEach((mesh) => mesh.geometry.deleteAttribute("position"));
  let disposed = 0;
  a.texture.addEventListener("dispose", () => disposed++);
  const r = createModelResource("https://model.test/empty.glb", {
    load: async () => a,
  });
  await settled(r);
  assert.throws(() => r.read(), EmptyModelError);
  assert.equal(disposed, 1);
  r.dispose();
  assert.equal(disposed, 1);
});
test("binary validation rejects malformed, truncated and external-resource GLBs", () => {
  assert.doesNotThrow(() => validateGLB(glb()));
  for (const b of [
    new ArrayBuffer(4),
    glb({ asset: { version: "1.0" }, scenes: [] }),
    glb({
      asset: { version: "2.0" },
      scenes: [],
      images: [{ uri: "https://untrusted.test/pixel.png" }],
    }),
    glb({
      asset: { version: "2.0" },
      scenes: [],
      buffers: [{ uri: "data:application/octet-stream;base64,AA==" }],
    }),
  ])
    assert.throws(() => validateGLB(b));
  const bad = glb();
  new DataView(bad).setUint32(8, bad.byteLength + 4, true);
  assert.throws(() => validateGLB(bad));
});
test("model GET omits credentials, rejects redirects and enforces declared/streamed size caps", async () => {
  let init;
  const controller = new AbortController();
  const result = await fetchModelBytes(
    "https://model.test/a.glb",
    controller.signal,
    async (_, i) => {
      init = i;
      return new Response(glb());
    },
  );
  assert.equal(result.byteLength, glb().byteLength);
  assert.equal(init.credentials, "omit");
  assert.equal(init.mode, "cors");
  assert.equal(init.redirect, "error");
  assert.equal(init.signal, controller.signal);
  await assert.rejects(
    () =>
      fetchModelBytes(
        "https://model.test/a.glb",
        controller.signal,
        async () => new Response("", { status: 404 }),
      ),
    /request failed/,
  );
  await assert.rejects(
    () =>
      fetchModelBytes(
        "https://model.test/a.glb",
        controller.signal,
        async () =>
          new Response("", {
            headers: { "content-length": String(MAX_MODEL_BYTES + 1) },
          }),
      ),
    /too large/,
  );
  const chunks = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(MAX_MODEL_BYTES));
      c.enqueue(new Uint8Array(1));
      c.close();
    },
  });
  await assert.rejects(
    () =>
      fetchModelBytes(
        "https://model.test/a.glb",
        controller.signal,
        async () => new Response(chunks),
      ),
    /too large/,
  );
});
test("decoder guard terminates workers that appear after asynchronous init was cancelled", async () => {
  let resolve,
    terminated = 0;
  const workers = [];
  const decoder = {
    _getWorker() {
      return new Promise((r) => (resolve = r));
    },
    dispose() {
      workers.splice(0).forEach((w) => w.terminate());
    },
  };
  const controller = new AbortController();
  const release = guardDecoder(decoder, controller.signal);
  const pending = decoder._getWorker();
  controller.abort();
  const worker = {
    terminate() {
      terminated++;
    },
  };
  workers.push(worker);
  resolve(worker);
  await assert.rejects(() => pending, /cancelled/);
  release();
  assert.equal(terminated, 1);
});
test("entry registry preserves supported legacy coordinates and rejects duplicates/unsupported chapters", () => {
  assert.deepEqual(parseShowcaseEntry({}), { part: 6, chapter: 0 });
  assert.deepEqual(parseShowcaseEntry({ part: "6", chapter: "0" }), {
    part: 6,
    chapter: 0,
  });
  for (const input of [
    { part: ["6", "6"] },
    { chapter: "1" },
    { part: "0" },
    { part: "-1" },
    { part: "NaN" },
    { chapter: "0.0" },
  ])
    assert.throws(() => parseShowcaseEntry(input));
});

test("failed parses release already-created and late texture/mesh dependencies with one shared ledger", async () => {
  const a = asset(),
    counts = { geometry: 0, material: 0, texture: 0 };
  for (const key of Object.keys(counts))
    a[key].addEventListener("dispose", () => counts[key]++);
  let textureResolve, meshResolve;
  const pending = {
    texture: new Promise((r) => (textureResolve = r)),
    mesh: new Promise((r) => (meshResolve = r)),
  };
  const parser = { getDependency: (type) => pending[type] };
  const controller = new AbortController();
  const tracker = trackParseResources(parser, controller.signal);
  parser.getDependency("texture", 0);
  parser.getDependency("mesh", 0);
  controller.abort();
  textureResolve(a.texture);
  meshResolve(a.scene);
  await yieldTask();
  tracker.release();
  assert.deepEqual(counts, { geometry: 1, material: 1, texture: 1 });
  assert.equal(a.image.closeCount, 1);
});
