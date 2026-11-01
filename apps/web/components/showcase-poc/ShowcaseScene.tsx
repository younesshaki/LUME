"use client";
import {
  Component,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import Lenis from "lenis";
import CameraRig from "./CameraRig";
import { useDisposableGLTF } from "./useDisposableGLTF";

class ModelBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p role="alert">
        The model could not load. Public R2 access and CORS must be available;
        navigation above still works.
      </p>
    ) : (
      this.props.children
    );
  }
}
function Product({
  url,
  ready,
}: {
  url: string;
  ready: (meshes: number) => void;
}) {
  const model = useDisposableGLTF(url);
  useEffect(() => ready(model.meshes), [model.meshes, ready]);
  return (
    <group scale={model.scale}>
      <primitive
        object={model.scene}
        position={model.center.clone().negate()}
        dispose={null}
      />
    </group>
  );
}
export default function ShowcaseScene({ modelUrl }: { modelUrl: string }) {
  const section = useRef<HTMLElement>(null);
  const progress = useRef(0);
  const [meshes, setMeshes] = useState(0);
  const [motion, setMotion] = useState<"smooth" | "reduced" | null>(null);
  useEffect(() => {
    const root = section.current;
    if (!root) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    setMotion(reduced ? "reduced" : "smooth");
    const lenis = reduced
      ? null
      : new Lenis({ autoRaf: false, smoothWheel: true });
    let frame = 0;
    const tick = (time: number) => {
      lenis?.raf(time);
      const start = root.getBoundingClientRect().top + window.scrollY;
      const distance = Math.max(1, root.offsetHeight - window.innerHeight);
      progress.current = reduced
        ? 0
        : Math.min(1, Math.max(0, (window.scrollY - start) / distance));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    // Leave history.scrollRestoration and initial scroll position to Next/the
    // browser. Forcing scrollTo(0) here would destroy popstate/refresh restore.
    return () => {
      cancelAnimationFrame(frame);
      lenis?.destroy();
    };
  }, []);
  return (
    <section
      ref={section}
      className="showcase-poc__scene"
      data-testid="showcase-scene"
      data-motion={motion}
      aria-label="Scene one product study"
    >
      <div className="showcase-poc__sticky">
        <p className="showcase-poc__caption">
          A cinematic product study.{" "}
          {motion === "reduced"
            ? "Reduced motion: camera remains still."
            : "Scroll to follow the camera."}
        </p>
        <ModelBoundary>
          <div className="showcase-poc__canvas">
            <Canvas
              dpr={[1, 1.5]}
              camera={{ position: [-1.2, 0.8, 6.4], fov: 48 }}
              gl={{ antialias: true }}
              fallback={
                <p>
                  WebGL is unavailable. Navigation and product information
                  remain available.
                </p>
              }
            >
              <color attach="background" args={["#15171d"]} />
              <ambientLight intensity={1.4} />
              <directionalLight position={[3, 5, 4]} intensity={4} />
              <directionalLight
                position={[-3, 1, -2]}
                intensity={2}
                color="#c48d7e"
              />
              <Suspense fallback={null}>
                <Product url={modelUrl} ready={setMeshes} />
                {/* The existing showcase/ShowcaseScene.tsx sparkle settings. */}
                <Sparkles
                  count={20}
                  size={2.2}
                  scale={[5, 3, 4]}
                  speed={motion === "reduced" ? 0 : 0.25}
                  color="#c48d7e"
                />
              </Suspense>
              <CameraRig progress={progress} />
            </Canvas>
          </div>
          <p role="status" data-testid="model-status" data-meshes={meshes}>
            {meshes
              ? "The product model is ready."
              : "Loading the product model…"}
          </p>
        </ModelBoundary>
      </div>
    </section>
  );
}
