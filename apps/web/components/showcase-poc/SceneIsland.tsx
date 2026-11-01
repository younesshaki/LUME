"use client";
import dynamic from "next/dynamic";

// App Router requires ssr:false to live in a client boundary. Nothing in the
// parent server route imports WebGL, Lenis, a model loader or browser globals.
const Scene = dynamic(() => import("./ShowcaseScene"), {
  ssr: false,
  // Reserve the final scene height before the lazy chunk arrives. A shorter
  // placeholder causes browser scroll anchoring to move restored positions.
  loading: () => (
    <section className="showcase-poc__scene" aria-label="Preparing scene one">
      <div className="showcase-poc__sticky">
        <p>Preparing the scene…</p>
      </div>
    </section>
  ),
});
export default function SceneIsland({ modelUrl }: { modelUrl: string }) {
  return <Scene modelUrl={modelUrl} />;
}
