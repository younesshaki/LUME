"use client";
import { Box3, Vector3, Mesh } from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { loadModel } from "./loadModel";
import { disposeModel } from "./disposeModel";
import { EmptyModelError, ModelLoadError } from "./model-policy";

export function prepareModel(gltf: GLTF) {
  let meshes = 0;
  gltf.scene.traverse((node) => {
    if (node instanceof Mesh && node.geometry.getAttribute("position")?.count)
      meshes++;
  });
  const bounds = new Box3().setFromObject(gltf.scene);
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  const extent = Math.max(size.x, size.y, size.z);
  if (
    !meshes ||
    !Number.isFinite(extent) ||
    extent <= 0 ||
    !center.toArray().every(Number.isFinite)
  )
    throw new EmptyModelError("No viewable geometry");
  return { gltf, scene: gltf.scene, meshes, center, scale: 2.7 / extent };
}
export type OwnedModel = ReturnType<typeof prepareModel>;
export type ModelResource = {
  read(): OwnedModel;
  dispose(): void;
  readonly status: "loading" | "ready" | "error" | "disposed";
};
/** Created in an effect, never during render: StrictMode/Suspense abandoned
 * renders cannot start I/O or leak cached resources. Each view owns its parse.
 */
export function createModelResource(
  url: string,
  options: { load?: typeof loadModel; timeoutMs?: number } = {},
): ModelResource {
  const controller = new AbortController();
  let status: ModelResource["status"] = "loading",
    model: OwnedModel | undefined,
    failure: unknown;
  let settleAbort: (() => void) | undefined;
  const aborted = new Promise<void>((resolve) => {
    settleAbort = resolve;
  });
  const onAbort = () => {
    if (status !== "disposed") {
      status = "error";
      failure = new ModelLoadError("Model loading timed out");
    }
    settleAbort?.();
  };
  controller.signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 30000,
  );
  const pending = Promise.resolve()
    .then(() => {
      controller.signal.throwIfAborted();
      return (options.load ?? loadModel)(url, controller.signal);
    })
    .then((gltf) => {
      if (controller.signal.aborted || status === "disposed") {
        disposeModel(gltf);
        return;
      }
      try {
        model = prepareModel(gltf);
        status = "ready";
      } catch (error) {
        disposeModel(gltf);
        throw error;
      }
    })
    .catch((error) => {
      if (status !== "disposed" && !controller.signal.aborted) {
        failure = error;
        status = "error";
      }
    })
    .finally(() => {
      clearTimeout(timer);
      controller.signal.removeEventListener("abort", onAbort);
    });
  const settled = Promise.race([pending, aborted]);
  return {
    get status() {
      return status;
    },
    read() {
      if (status === "loading") throw settled;
      if (status === "ready" && model) return model;
      throw failure ?? new ModelLoadError("Model view is closed");
    },
    dispose() {
      if (status === "disposed") return;
      status = "disposed";
      clearTimeout(timer);
      controller.abort();
      settleAbort?.();
      if (model) {
        disposeModel(model.gltf);
        model = undefined;
      }
    },
  };
}
