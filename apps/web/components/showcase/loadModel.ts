"use client";
import {
  GLTFLoader,
  type GLTF,
  type GLTFParser,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import { disposeModel, resourceDisposer } from "./disposeModel";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import {
  DRACO_PATH,
  MAX_MODEL_BYTES,
  ModelLoadError,
  validateGLB,
} from "./model-policy";

/** Three 0.164.1 can finish decoder initialization AFTER dispose(). Guard that
 * instance's worker acquisition, so late initialization cannot orphan a worker.
 * This single pinned adapter must be retested on Three upgrades. No global patch.
 */
export function guardDecoder<T extends { dispose(): unknown }>(
  decoder: T,
  signal: AbortSignal,
): () => void {
  const internals = decoder as T & {
    _getWorker?: (...args: unknown[]) => Promise<Worker>;
  };
  const acquire = internals._getWorker;
  if (!acquire) throw new ModelLoadError("Unsupported decoder lifecycle");
  internals._getWorker = async function (...args) {
    const worker = await acquire.apply(decoder, args);
    if (signal.aborted) {
      decoder.dispose();
      throw new ModelLoadError("Model loading cancelled");
    }
    return worker;
  };
  const dispose = () => {
    decoder.dispose();
  };
  signal.addEventListener("abort", dispose, { once: true });
  return () => {
    signal.removeEventListener("abort", dispose);
    decoder.dispose();
  };
}
export async function fetchModelBytes(
  url: string,
  signal: AbortSignal,
  transport: typeof fetch = fetch,
) {
  const response = await transport(url, {
    signal,
    mode: "cors",
    credentials: "omit",
    redirect: "error",
  });
  if (!response.ok) throw new ModelLoadError("Model request failed");
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_MODEL_BYTES) {
    await response.body?.cancel();
    throw new ModelLoadError("Model is too large");
  }
  if (!response.body) throw new ModelLoadError("Model response is empty");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_MODEL_BYTES) {
        await reader.cancel();
        throw new ModelLoadError("Model is too large");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  signal.throwIfAborted();
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  validateGLB(result.buffer);
  return result.buffer;
}
/** Track partial/late allocations through GLTFParser's public dependency API. */
export function trackParseResources(
  parser: Pick<GLTFParser, "getDependency">,
  signal: AbortSignal,
) {
  const dispose = resourceDisposer(),
    resources = new Set<unknown>(),
    tracked = new Set<string>();
  let failed = false;
  const original = parser.getDependency.bind(parser);
  parser.getDependency = (type, index) => {
    const promise = original(type, index),
      key = `${type}:${index}`;
    if (
      ["texture", "material", "mesh", "node", "scene"].includes(type) &&
      !tracked.has(key)
    ) {
      tracked.add(key);
      promise.then(
        (value: unknown) => {
          if (failed) dispose(value);
          else resources.add(value);
        },
        () => {},
      );
    }
    return promise;
  };
  const fail = () => {
    failed = true;
    resources.forEach(dispose);
    resources.clear();
  };
  signal.addEventListener("abort", fail, { once: true });
  return {
    fail,
    dispose,
    release() {
      signal.removeEventListener("abort", fail);
      resources.clear();
      if (!failed) parser.getDependency = original;
    },
  };
}
export async function loadModel(
  url: string,
  signal: AbortSignal,
): Promise<GLTF> {
  const bytes = await fetchModelBytes(url, signal);
  signal.throwIfAborted();
  if (typeof WebAssembly !== "object")
    throw new ModelLoadError("WebAssembly is unavailable");
  const decoder = new DRACOLoader()
    .setDecoderPath(DRACO_PATH)
    .setDecoderConfig({ type: "wasm" })
    .setWorkerLimit(2);
  const release = guardDecoder(decoder, signal);
  let tracked: ReturnType<typeof trackParseResources> | undefined;
  try {
    const loader = new GLTFLoader().setDRACOLoader(decoder);
    loader.register((parser) => {
      tracked = trackParseResources(parser, signal);
      return { name: "LUME_owned_resources" };
    });
    const model = await loader.parseAsync(bytes, "");
    if (signal.aborted) {
      disposeModel(model, tracked?.dispose);
      throw new ModelLoadError("Model loading cancelled");
    }
    return model;
  } catch {
    tracked?.fail();
    throw new ModelLoadError("Model decoding failed");
  } finally {
    tracked?.release();
    release();
  }
}
