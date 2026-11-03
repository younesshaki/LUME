import test from "node:test";
import assert from "node:assert/strict";
import {
  EffectComposer,
  BloomEffect,
  EffectPass,
  RenderPass,
} from "postprocessing";
import { PerspectiveCamera, Scene } from "three";
import {
  createEffectsOwner,
  ownComposer,
} from "../components/showcase/composer-ownership.ts";

function fixture() {
  // Real CPU-side postprocessing resources; actual GPU allocation is tested in Chromium.
  const composer = new EffectComposer(null, { multisampling: 0 });
  const bloom = new BloomEffect({ mipmapBlur: true, levels: 5 });
  const camera = new PerspectiveCamera(),
    render = new RenderPass(new Scene(), camera);
  const pass = new EffectPass(camera, bloom);
  composer.passes.push(render, pass);
  const resources = [
    ...new Set([
      composer.inputBuffer,
      composer.outputBuffer,
      bloom.renderTarget,
      bloom.mipmapBlurPass.renderTarget,
      ...bloom.mipmapBlurPass.downsamplingMipmaps,
      ...bloom.mipmapBlurPass.upsamplingMipmaps,
    ]),
  ];
  const counts = resources.map(() => 0);
  resources.forEach((resource, i) =>
    resource.addEventListener("dispose", () => counts[i]++),
  );
  let passDisposals = 0,
    effectDisposals = 0;
  const releasePass = pass.dispose.bind(pass),
    releaseBloom = bloom.dispose.bind(bloom);
  pass.dispose = () => {
    passDisposals++;
    releasePass();
  };
  bloom.dispose = () => {
    effectDisposals++;
    releaseBloom();
  };
  return {
    composer,
    pass,
    counts,
    disposed: () => ({ passDisposals, effectDisposals }),
  };
}
test("owned composer disposes real bloom mip targets, main buffers and EffectPass once", () => {
  const f = fixture(),
    release = ownComposer(f.composer);
  release();
  const afterFirst = [...f.counts];
  release();
  assert.deepEqual(f.counts, afterFirst);
  assert.deepEqual(f.counts.slice(0, 2), [1, 1]);
  // 6.38 internally aliases one mip target and dispatches its dispose twice;
  // GPU deallocation detaches its listener after the first event. All unique
  // targets must release; the outer composer/EffectPass lease runs only once.
  assert.ok(f.counts.length > 10);
  assert.ok(f.counts.every((n) => n >= 1));
  assert.deepEqual(f.disposed(), { passDisposals: 1, effectDisposals: 1 });
});
test("React pass-detach ordering cannot hide bloom resources from the owner", () => {
  const f = fixture(),
    release = ownComposer(f.composer);
  f.composer.removePass(f.pass);
  release();
  assert.ok(f.counts.every((n) => n >= 1));
  assert.deepEqual(f.disposed(), { passDisposals: 1, effectDisposals: 1 });
});
test("scene owner releases superseded and late composer leases without closing another scene", () => {
  const a = createEffectsOwner(),
    b = createEffectsOwner();
  let first = 0,
    second = 0,
    late = 0,
    other = 0;
  const releaseFirst = a.hold(() => first++);
  b.hold(() => other++);
  a.hold(() => second++);
  releaseFirst();
  assert.deepEqual([first, second, other], [1, 0, 0]);
  a.close();
  a.close();
  const releaseLate = a.hold(() => late++);
  releaseLate();
  assert.deepEqual([first, second, late, other], [1, 1, 1, 0]);
  b.close();
  assert.equal(other, 1);
});
test("reduced-motion detach releases composer while permitting a fresh normal-motion lease", () => {
  const owner = createEffectsOwner(),
    first = fixture(),
    resumed = fixture();
  const detach = owner.hold(ownComposer(first.composer));
  detach();
  assert.ok(first.counts.every((n) => n >= 1));
  assert.ok(resumed.counts.every((n) => n === 0));
  owner.hold(ownComposer(resumed.composer));
  owner.close();
  assert.ok(resumed.counts.every((n) => n >= 1));
});
