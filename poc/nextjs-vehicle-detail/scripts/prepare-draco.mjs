import { mkdir, copyFile } from 'node:fs/promises';
// Decoder artifacts come from the integrity-locked Three.js dependency.
// Generate inside the POC only; do not depend on the root's missing WASM file.
const target = new URL('../public/draco/', import.meta.url);
await mkdir(target, { recursive: true });
for (const name of ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js']) {
  await copyFile(new URL(`../node_modules/three/examples/jsm/libs/draco/gltf/${name}`, import.meta.url), new URL(name, target));
}
await copyFile(new URL('../node_modules/three/LICENSE', import.meta.url), new URL('THREE-LICENSE', target));
