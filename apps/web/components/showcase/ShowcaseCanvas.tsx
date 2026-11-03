"use client";
import {
  Component,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createRoot, extend, events } from "@react-three/fiber";
import {
  WebGLRenderer,
  Group,
  Color,
  AmbientLight,
  DirectionalLight,
  Points,
  BufferGeometry,
  BufferAttribute,
} from "three";
import type { OwnedModel } from "./model-resource";
import OpeningScene from "./OpeningScene";

extend({
  Group,
  Color,
  AmbientLight,
  DirectionalLight,
  Points,
  BufferGeometry,
  BufferAttribute,
});
class SceneBoundary extends Component<
  { children: ReactNode; failed: (error: Error) => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    this.props.failed(error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
/** Explicit renderer ownership: R3F's high-level Canvas does not catch its async
 * configure() rejection. Keep init/resize errors in the DOM error boundary and
 * release the context, including when construction or configure fails. */
export default function ShowcaseCanvas({
  model,
  reduced,
}: {
  model: OwnedModel;
  reduced: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null),
    preference = useRef(reduced),
    refresh = useRef<(() => void) | null>(null);
  const [error, setError] = useState<Error | null>(null);
  preference.current = reduced;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let root: ReturnType<typeof createRoot> | undefined,
      renderer: WebGLRenderer | undefined,
      observer: ResizeObserver | undefined;
    let closed = false,
      configured = false;
    let size = canvas.parentElement!.getBoundingClientRect();
    const close = () => {
      if (closed) return;
      closed = true;
      configured = false;
      observer?.disconnect();
      refresh.current = null;
      canvas.removeEventListener("webglcontextlost", lost);
      root?.unmount();
      renderer?.dispose();
      if (renderer) renderer.forceContextLoss();
      else
        canvas
          .getContext("webgl2")
          ?.getExtension("WEBGL_lose_context")
          ?.loseContext();
    };
    const fail = (failure: unknown) => {
      if (closed) return;
      close();
      setError(
        failure instanceof Error
          ? failure
          : new Error("Graphics view unavailable"),
      );
    };
    const lost = () => fail(new Error("Graphics context unavailable"));
    const render = () => {
      if (closed || !configured || !root) return;
      root.render(
        <SceneBoundary
          failed={(failure) => queueMicrotask(() => fail(failure))}
        >
          <Suspense fallback={null}>
            <color attach="background" args={["#15171d"]} />
            <OpeningScene model={model} reduced={preference.current} />
          </Suspense>
        </SceneBoundary>,
      );
    };
    const update = () => {
      if (closed || !configured || !root) return;
      root
        .configure({
          size: {
            width: Math.max(1, size.width),
            height: Math.max(1, size.height),
            top: size.top,
            left: size.left,
          },
          frameloop: preference.current ? "demand" : "always",
        })
        .then(render)
        .catch(fail);
    };
    refresh.current = update;
    const start = async () => {
      try {
        renderer = new WebGLRenderer({
          canvas,
          antialias: true,
          alpha: false,
        });
        const context = renderer.getContext();
        const lose = renderer.forceContextLoss.bind(renderer);
        renderer.forceContextLoss = () => {
          if (!context.isContextLost()) lose();
        };
        canvas.addEventListener("webglcontextlost", lost);
        root = createRoot(canvas);
        await root.configure({
          gl: renderer,
          events,
          dpr: [1, 1.5],
          camera: { position: [-1.2, 0.8, 6.4], fov: 48 },
          size: {
            width: Math.max(1, size.width),
            height: Math.max(1, size.height),
            top: size.top,
            left: size.left,
          },
          frameloop: preference.current ? "demand" : "always",
          onCreated: (state) => state.events.connect?.(canvas),
        });
        if (closed) return;
        configured = true;
        observer = new ResizeObserver((entries) => {
          size = entries[0].target.getBoundingClientRect();
          update();
        });
        observer.observe(canvas.parentElement!);
        render();
      } catch (failure) {
        fail(failure);
      }
    };
    void start();
    return close;
  }, [model]);
  useEffect(() => refresh.current?.(), [reduced]);
  if (error) throw error;
  return (
    <canvas
      ref={canvasRef}
      style={{ display: "block", width: "100%", height: "100%" }}
      aria-label="LUME product model"
    />
  );
}
