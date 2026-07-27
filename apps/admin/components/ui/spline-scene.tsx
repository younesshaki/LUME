"use client";

import dynamic from "next/dynamic";
import type { Application } from "@splinetool/runtime";

import { Spinner } from "@/components/ui/spinner";

function SceneFallback() {
  return (
    <div className="flex size-full items-center justify-center">
      <Spinner className="size-6 text-white/30" />
    </div>
  );
}

// WebGL can't render on the server, and the Spline runtime is multiple
// megabytes — `ssr: false` keeps it out of the server render and in its own
// lazy chunk, so no other admin route pays for it.
const Spline = dynamic(() => import("@splinetool/react-spline"), {
  ssr: false,
  loading: () => <SceneFallback />,
});

export type SplineSceneProps = {
  scene: string;
  className?: string;
  onLoad?: (app: Application) => void;
};

export function SplineScene({ scene, className, onLoad }: SplineSceneProps) {
  return <Spline scene={scene} className={className} onLoad={onLoad} />;
}
