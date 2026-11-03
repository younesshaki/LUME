import "server-only";
import type { ShowcaseAssets } from "../../components/showcase/types";
import { sceneManifest, modelKeys } from "./scene-manifest";

/** Only server configuration chooses this origin; no request-controlled URL/key. */
export function showcaseAssets(base: string | undefined): ShowcaseAssets {
  if (!base)
    return {
      scenes: sceneManifest.map((scene) => ({ ...scene, modelUrl: null })),
    };
  let origin: URL;
  try {
    origin = new URL(base);
  } catch {
    throw new Error("Invalid public preview media origin");
  }
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    /[\\\u0000-\u0020]/.test(base)
  )
    throw new Error("Invalid public preview media origin");
  return {
    scenes: sceneManifest.map((scene) => ({
      ...scene,
      modelUrl: `${origin.href.replace(/\/$/, "")}/${modelKeys[scene.id]}`,
    })),
  };
}
