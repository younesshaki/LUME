"use client";
import {
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ShowcaseProps, ShowcaseScene } from "./types";
import { useDisposableGLTF } from "./useDisposableGLTF";
import type { ModelResource } from "./model-resource";
import ModelBoundary, { LoadingModel } from "./ModelBoundary";
import ShowcaseCanvas from "./ShowcaseCanvas";
import { createStoryStore, type StoryStore } from "./story-store";
import { StoryProvider } from "./StoryBridge";
import { useStoryScroll } from "./useStoryScroll";
import StoryNarrative from "./StoryNarrative";
import StoryConsent from "./StoryConsent";
import ShowcaseAudio from "./ShowcaseAudio";
function Viewport({
  resource,
  reduced,
  scene,
  store,
}: {
  resource: ModelResource;
  reduced: boolean;
  scene: ShowcaseScene;
  store: StoryStore;
}) {
  const model = resource.read();
  return (
    <>
      <div className="showcase__canvas">
        <ShowcaseCanvas
          model={model}
          reduced={reduced}
          scene={scene}
          store={store}
        />
      </div>
      <p role="status">The product is ready to explore.</p>
    </>
  );
}
function ModelView({
  url,
  reduced,
  scene,
  store,
}: {
  url: string;
  reduced: boolean;
  scene: ShowcaseScene;
  store: StoryStore;
}) {
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
          <Viewport
            resource={resource}
            reduced={reduced}
            scene={scene}
            store={store}
          />
        ) : (
          <LoadingModel />
        )}
      </Suspense>
    </ModelBoundary>
  );
}
export default function Experience({ assets, tenant }: ShowcaseProps) {
  const [store] = useState(() => createStoryStore(assets.scenes[0].id));
  const sceneId = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().sceneId,
    () => assets.scenes[0].id,
  );
  const scene = assets.scenes.find((s) => s.id === sceneId)!;
  const element = useRef<HTMLElement>(null);
  const picker = useRef<HTMLElement>(null);
  const [reduced, setReduced] = useState(true);
  const [wasm, setWasm] = useState<boolean | null>(null);
  const select = useStoryScroll(element, assets.scenes, store, reduced);
  useEffect(() => {
    const nav = picker.current;
    const selected = nav?.querySelector<HTMLElement>('[aria-current="step"]');
    if (nav && selected && nav.scrollWidth > nav.clientWidth) {
      const item = selected.getBoundingClientRect(),
        box = nav.getBoundingClientRect();
      // Only horizontal movement; never interfere with Lenis/browser restoration.
      nav.scrollLeft += item.left - box.left - (box.width - item.width) / 2;
    }
  }, [scene.id]);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    setWasm(typeof WebAssembly === "object");
    return () => query.removeEventListener("change", update);
  }, []);
  return (
    <StoryProvider store={store}>
      <section
        ref={element}
        className="showcase__reserved showcase__experience"
        data-motion={reduced ? "reduced" : "full"}
        data-active-scene={scene.id}
      >
        <div className="showcase__sticky">
          <p className="showcase__caption">
            A cinematic product study.
            {reduced ? " Reduced motion is enabled." : ""}
          </p>
          <nav
            ref={picker}
            className="showcase__scene-picker"
            aria-label="Story scenes"
          >
            {assets.scenes.map((s, i) => (
              <button
                type="button"
                key={s.id}
                aria-current={s.id === scene.id ? "step" : undefined}
                onClick={() => select(i)}
              >
                {s.label ?? s.title}
              </button>
            ))}
          </nav>
          <ShowcaseAudio store={store} scenes={assets.scenes} tenant={tenant} />
          {!scene.modelUrl ? (
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
              key={scene.id}
              url={scene.modelUrl}
              reduced={reduced}
              scene={scene}
              store={store}
            />
          )}
          <StoryNarrative scene={scene} tenant={tenant} />
        </div>
      </section>
      <StoryConsent tenant={tenant} store={store} />
    </StoryProvider>
  );
}
