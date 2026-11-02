"use client";
import { Suspense, useEffect, useState } from "react";
import type { ShowcaseProps } from "./types";
import { useDisposableGLTF } from "./useDisposableGLTF";
import type { ModelResource } from "./model-resource";
import ModelBoundary, { LoadingModel } from "./ModelBoundary";
import ShowcaseCanvas from "./ShowcaseCanvas";
function Viewport({
  resource,
  reduced,
}: {
  resource: ModelResource;
  reduced: boolean;
}) {
  const model = resource.read();
  return (
    <>
      <div className="showcase__canvas">
        <ShowcaseCanvas model={model} reduced={reduced} />
      </div>
      <p role="status">The product is ready to explore.</p>
    </>
  );
}
function ModelView({ url, reduced }: { url: string; reduced: boolean }) {
  const [attempt, setAttempt] = useState(0);
  const resource = useDisposableGLTF(url, attempt);
  return (
    <ModelBoundary
      key={attempt}
      retry={() => setAttempt((n) => n + 1)}
      failed={() => resource?.dispose()}
    >
      <Suspense fallback={<LoadingModel />}>
        {resource ? (
          <Viewport resource={resource} reduced={reduced} />
        ) : (
          <LoadingModel />
        )}
      </Suspense>
    </ModelBoundary>
  );
}
export default function Experience({ assets }: ShowcaseProps) {
  const [reduced, setReduced] = useState(true);
  const [wasm, setWasm] = useState<boolean | null>(null);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    setWasm(typeof WebAssembly === "object");
    return () => query.removeEventListener("change", update);
  }, []);
  return (
    <section
      className="showcase__reserved showcase__experience"
      data-motion={reduced ? "reduced" : "full"}
    >
      <div className="showcase__sticky">
        <p className="showcase__caption">
          A cinematic product study.
          {reduced ? " Reduced motion is enabled." : ""}
        </p>
        {!assets.modelUrl ? (
          <div className="showcase__state" role="status">
            <h2>No 3D view is available</h2>
            <p>Product information and navigation remain available.</p>
          </div>
        ) : wasm === false ? (
          <div className="showcase__state" role="status">
            <p>
              This view needs WebGL and WebAssembly. Product information and
              navigation remain available.
            </p>
          </div>
        ) : wasm === null ? (
          <LoadingModel />
        ) : (
          <ModelView
            key={assets.modelUrl}
            url={assets.modelUrl}
            reduced={reduced}
          />
        )}
      </div>
      <div className="showcase__narrative">
        <p>Every scene can carry a feature, a detail, or a proof point.</p>
        <p>The structure is ready.</p>
        <p>The brand story can now take its place.</p>
      </div>
    </section>
  );
}
