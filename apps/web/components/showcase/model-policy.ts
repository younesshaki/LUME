"use client";
export const DRACO_PATH = "/showcase-assets/draco/three-0.164.1/";
export const MAX_MODEL_BYTES = 32 * 1024 * 1024;
export class ModelLoadError extends Error {}
export class EmptyModelError extends ModelLoadError {}
/** Self-contained GLB only: no external texture/buffer fetches or credentials. */
export function validateGLB(buffer: ArrayBuffer) {
  if (buffer.byteLength < 20 || buffer.byteLength > MAX_MODEL_BYTES)
    throw new ModelLoadError("Invalid model size");
  const view = new DataView(buffer);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== buffer.byteLength ||
    view.getUint32(16, true) !== 0x4e4f534a
  )
    throw new ModelLoadError("Invalid binary glTF");
  const length = view.getUint32(12, true);
  if (length > buffer.byteLength - 20)
    throw new ModelLoadError("Invalid model document");
  let json;
  try {
    json = JSON.parse(
      new TextDecoder().decode(new Uint8Array(buffer, 20, length)),
    );
  } catch {
    throw new ModelLoadError("Invalid model document");
  }
  if (json.asset?.version !== "2.0" || !Array.isArray(json.scenes))
    throw new ModelLoadError("Unsupported model document");
  for (const item of [...(json.buffers ?? []), ...(json.images ?? [])])
    if (item.uri !== undefined)
      throw new ModelLoadError("Model must use embedded buffers and images");
  return json;
}
