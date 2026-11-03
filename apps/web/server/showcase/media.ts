import "server-only";
import type { ShowcaseAssets } from "../../components/showcase/types";

/** Only server configuration chooses this origin; no request-controlled URL/key. */
export function showcaseAssets(base: string | undefined): ShowcaseAssets {
  if (!base) return { modelUrl: null };
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
    modelUrl: `${origin.href.replace(/\/$/, "")}/vehicle%20images/3D%20assets/blackredbull6.optimized.glb`,
  };
}
