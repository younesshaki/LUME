import "server-only";

// Disposable spike: the one existing product asset in the Vite product catalog.
// Public media only; never serialize the environment or a signing credential.
export function showcaseModelUrl(base: string | undefined): string | null {
  if (!base) return null;
  const url = new URL(base);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("Invalid public preview media origin");
  return `${url.href.replace(/\/$/, "")}/vehicle%20images/3D%20assets/blackredbull6.optimized.glb`;
}
