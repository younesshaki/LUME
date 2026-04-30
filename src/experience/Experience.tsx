import { Canvas } from "@react-three/fiber";
import { AdaptiveDpr, OrbitControls, PerformanceMonitor } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import CameraRig from "./CameraRig";
import SceneManager from "./SceneManager";
import FadeOverlay from "./FadeOverlay";
import ChapterNav from "./ui/ChapterNav";
import CanvasErrorBoundary from "./CanvasErrorBoundary";
import { LoaderOverlay } from "./loaders/shared/LoaderOverlay";
import type { LoaderVariant } from "./loaders/shared/types";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { parts } from "./parts";
import gsap from "gsap";
import { ModelPreloader } from "./ModelPreloader";
import { preloadAdjacentChapters } from "./sceneAssets";
import { useLoadingController } from "./hooks/useLoadingController";
import { SoundProvider } from "./soundContext";
import { useSmoothScroll } from "./hooks/useSmoothScroll";
import { BackgroundVideo as ShowcaseBackgroundVideo } from "./scenes/showcase/BackgroundVideo";
import { ShowcaseLyricsDisplay } from "./scenes/showcase/ShowcaseLyricsDisplay";
import {
  preloadShowcaseBackgroundVideos,
  subscribeToShowcaseVideoPreload,
  type VideoPreloadSnapshot,
} from "./scenes/showcase/videoPreloadCache";
import type { ShowcaseVideoQuality } from "./scenes/showcase/data/sceneAssets";
import { ScrollIndicator } from "./scenes/shared/ScrollIndicator";
import { ShowcaseChapterProgress } from "./ui/ShowcaseChapterProgress";
import { ButterflySwarm } from "./ui/ButterflySwarm";
import { useStory } from "./story/StoryProvider";
import {
  getChapterDefinition,
  getChapterIndicesById,
  getFirstSceneId,
  getPartDefinition,
} from "./story/manifest";

import { DebugOverlay, DebugPanel } from "./utils/DebugOverlay";

// Wrapper component to handle the hook and conditional rendering
function DebugWrapper({ enabled }: { enabled: boolean }) {
  return enabled ? <DebugOverlay enabled={enabled} /> : null;
}

type ExperienceProps = {
  initialPartIndex?: number;
  initialChapterIndex?: number;
  onGoHome?: () => void;
  onShowcaseChapterRevealChange?: (revealed: boolean) => void;
  mediaQuality?: ShowcaseVideoQuality;
};

export default function Experience({
  initialPartIndex: propPartIndex,
  initialChapterIndex: propChapterIndex,
  onGoHome,
  onShowcaseChapterRevealChange,
  mediaQuality = "high",
}: ExperienceProps = {}) {
  const devToolsEnabled = import.meta.env.DEV;
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [syncPreviewEnabled, setSyncPreviewEnabled] = useState(false);
  const {
    isReady: storyReady,
    state: storyState,
    saveCheckpoint,
    setCurrentLocation,
    updatePreferences,
  } = useStory();

  // Initialize Lenis smooth scroll + ScrollTrigger integration
  // This enables scrub-based animations throughout the app
  useSmoothScroll(true);

  useEffect(() => {
    if (!devToolsEnabled) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Q to toggle debug mode
      if (e.key.toLowerCase() === "q") {
        e.preventDefault();
        setDebugEnabled((prev) => !prev);
      }
      // W to toggle sync preview panel
      if (e.key.toLowerCase() === "w") {
        e.preventDefault();
        setSyncPreviewEnabled((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [devToolsEnabled]);

  useEffect(() => {
    document.body.dataset.syncPreviewOpen = syncPreviewEnabled ? "true" : "false";
    return () => {
      delete document.body.dataset.syncPreviewOpen;
    };
  }, [syncPreviewEnabled]);

  const { isLoading, progress } = useLoadingController();
  
  // Resolve initial part/chapter from props, URL hash, or defaults
  const getInitialState = () => {
    // Props from homepage take priority
    if (propPartIndex !== undefined && propChapterIndex !== undefined) {
      return { partIndex: propPartIndex, chapterIndex: propChapterIndex };
    }

    // Fall back to URL hash
    const hash = window.location.hash;
    const match = hash.match(/#part-(\d+)-chapter-(\d+)/);
    if (match) {
      const p = parseInt(match[1], 10) - 1;
      const c = parseInt(match[2], 10) - 1;
      const partIndex = Math.max(0, Math.min(p, parts.length - 1));
      const chapterCount = parts[partIndex]?.chapters.length ?? 1;
      const chapterIndex = Math.max(0, Math.min(c, chapterCount - 1));
      return { partIndex, chapterIndex };
    }
    return { partIndex: 0, chapterIndex: 0 };
  };

  const [initialState] = useState(getInitialState);

  const [fade, setFade] = useState(0);
  const [activePartIndex, setActivePartIndex] = useState(initialState.partIndex);
  const [activeChapterIndex, setActiveChapterIndex] = useState(initialState.chapterIndex);
  const [visibleChapterIndex, setVisibleChapterIndex] = useState(initialState.chapterIndex);
  const [visiblePartIndex, setVisiblePartIndex] = useState(initialState.partIndex);
  const [sceneIndex, setSceneIndex] = useState(initialState.chapterIndex + 1);
  
  // Sync state to URL hash
  useEffect(() => {
    const hash = `#part-${activePartIndex + 1}-chapter-${activeChapterIndex + 1}`;
    if (window.location.hash !== hash) {
      window.history.replaceState(null, "", hash);
    }
  }, [activePartIndex, activeChapterIndex]);

  const [showLoader, setShowLoader] = useState(false);
  const [modelsPreloaded, setModelsPreloaded] = useState(false);
  const [preloadMinElapsed, setPreloadMinElapsed] = useState(false);
  const [initialRevealReady, setInitialRevealReady] = useState(false);
  const [canHideLoader, setCanHideLoader] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [showcaseSceneIndex, setShowcaseSceneIndex] = useState(-1);
  const [showcaseChapterProgress, setShowcaseChapterProgress] = useState(0);
  const [showcaseVideoPreload, setShowcaseVideoPreload] = useState<VideoPreloadSnapshot>({
    status: "idle",
    progress: 0,
    error: null,
    quality: mediaQuality,
  });
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const transitionRef = useRef<gsap.core.Timeline | null>(null);
  const restoredFromStoryRef = useRef(false);
  const loaderTextByPart = [
    "Loading Genesis",
    "Loading Trials",
    "Loading Exile",
    "Loading Ascension",
    "Loading Echoes",
    "Loading Part 6",
    "Loading Showcase",
  ];
  const isShowcaseChapter = visiblePartIndex === 6 && visibleChapterIndex === 0;
  const threeAssetProgress = isLoading ? progress : 100;
  const videoAssetProgress = showcaseVideoPreload.status === "ready" ? 100 : showcaseVideoPreload.progress;
  const combinedShowcaseProgress = Math.round((threeAssetProgress + videoAssetProgress) / 2);
  const progressLabel = isShowcaseChapter
    ? `Loading ${Math.min(99, combinedShowcaseProgress)}%`
    : isLoading
      ? `Loading ${progress}%`
      : "Ready";
  const loaderText = isLoading
    ? progressLabel
    : isShowcaseChapter && !initialRevealReady
      ? progressLabel
      : loaderTextByPart[visiblePartIndex] ?? "Loading...";
  const loaderVariant: LoaderVariant = (
    visiblePartIndex === 0
      ? "a"
      : visiblePartIndex === 1
        ? "b"
        : visiblePartIndex === 2
          ? "c"
          : visiblePartIndex === 3
            ? "d"
            : visiblePartIndex === 4
              ? "e"
              : "f"
  );
  const shouldShowLoader = showLoader && !canHideLoader;
  const preloaderVisible = !initialRevealReady;
  const scenesHidden = shouldShowLoader || preloaderVisible || fade > 0.01;
  const cameraEnabled = !preloaderVisible && !shouldShowLoader;

  useEffect(() => {
    onShowcaseChapterRevealChange?.(isShowcaseChapter && !preloaderVisible);
    return () => onShowcaseChapterRevealChange?.(false);
  }, [isShowcaseChapter, onShowcaseChapterRevealChange, preloaderVisible]);

  // Reset canHideLoader when chapter changes
  useEffect(() => {
    if (showLoader) {
      // When loader is shown (chapter change), reset canHideLoader to false
      setCanHideLoader(false);
    } else if (!showLoader && modelsPreloaded) {
      // After loader was hidden, allow it to be hidden by syncing with controller
      // This prevents blocking the fade out animation
      setCanHideLoader(true);
    }
  }, [showLoader, modelsPreloaded]);

  useEffect(() => {
    setSceneIndex(visibleChapterIndex + 1);
  }, [visibleChapterIndex]);

  useEffect(() => {
    return subscribeToShowcaseVideoPreload(mediaQuality, setShowcaseVideoPreload);
  }, [mediaQuality]);

  useEffect(() => {
    if (!isShowcaseChapter || initialRevealReady) return;
    void preloadShowcaseBackgroundVideos(mediaQuality);
  }, [initialRevealReady, isShowcaseChapter, mediaQuality]);

  useEffect(() => {
    if (!isShowcaseChapter || showcaseVideoPreload.status !== "error" || initialRevealReady) return;

    const retry = window.setTimeout(() => {
      void preloadShowcaseBackgroundVideos(mediaQuality);
    }, 3000);

    return () => window.clearTimeout(retry);
  }, [initialRevealReady, isShowcaseChapter, mediaQuality, showcaseVideoPreload.status]);

  useEffect(() => {
    if (!storyReady) {
      return;
    }

    setSoundEnabled(storyState.preferences.soundEnabled);
    setSoundBlocked(false);
  }, [storyReady, storyState.preferences.soundEnabled]);

  useEffect(() => {
    if (restoredFromStoryRef.current || !storyReady) {
      return;
    }

    restoredFromStoryRef.current = true;
    if (window.location.hash) {
      return;
    }

    const chapterId = storyState.resumeCheckpoint?.chapterId ?? storyState.currentChapterId;
    const indices = getChapterIndicesById(chapterId);
    if (!indices) {
      return;
    }

    setActivePartIndex(indices.partIndex);
    setActiveChapterIndex(indices.chapterIndex);
    setVisiblePartIndex(indices.partIndex);
    setVisibleChapterIndex(indices.chapterIndex);
    setSceneIndex(indices.chapterIndex + 1);
  }, [storyReady, storyState.currentChapterId, storyState.resumeCheckpoint]);

  useEffect(() => {
    if (!storyReady) {
      return;
    }

    const partDefinition = getPartDefinition(activePartIndex + 1);
    const chapterDefinition = getChapterDefinition(activePartIndex + 1, activeChapterIndex + 1);
    if (!partDefinition || !chapterDefinition) {
      return;
    }

    void setCurrentLocation(
      partDefinition.id,
      chapterDefinition.id,
      getFirstSceneId(chapterDefinition)
    );
  }, [activeChapterIndex, activePartIndex, setCurrentLocation, storyReady]);

  useEffect(() => {
    if (!storyReady) {
      return;
    }

    const partDefinition = getPartDefinition(visiblePartIndex + 1);
    const chapterDefinition = getChapterDefinition(visiblePartIndex + 1, visibleChapterIndex + 1);
    if (!partDefinition || !chapterDefinition) {
      return;
    }

    void saveCheckpoint(
      partDefinition.id,
      chapterDefinition.id,
      getFirstSceneId(chapterDefinition),
      0,
      {
        partIndex: visiblePartIndex,
        chapterIndex: visibleChapterIndex,
      }
    );
  }, [saveCheckpoint, storyReady, visibleChapterIndex, visiblePartIndex]);

  useEffect(() => {
    setModelsPreloaded(false);
    setPreloadMinElapsed(false);
    setInitialRevealReady(false);
    const timer = window.setTimeout(() => setPreloadMinElapsed(true), 7800);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (modelsPreloaded) {
      return;
    }

    const showcaseVideosReady = !isShowcaseChapter || showcaseVideoPreload.status === "ready";

    if (preloadMinElapsed && !isLoading && showcaseVideosReady) {
      const rafId = window.requestAnimationFrame(() => {
        setModelsPreloaded(true);
      });
      return () => window.cancelAnimationFrame(rafId);
    }
  }, [isLoading, isShowcaseChapter, preloadMinElapsed, modelsPreloaded, showcaseVideoPreload.status]);

  useEffect(() => {
    if (!modelsPreloaded || initialRevealReady) {
      return;
    }

    let raf1 = 0;
    let raf2 = 0;
    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        setInitialRevealReady(true);
      });
    });

    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
    };
  }, [modelsPreloaded, initialRevealReady]);

  // Smart preloading: Load current and adjacent chapters only
  useEffect(() => {
    preloadAdjacentChapters(visiblePartIndex + 1, visibleChapterIndex + 1);
  }, [visibleChapterIndex, visiblePartIndex]);

  const handleSelectionChange = useCallback(
    (partIndex: number, chapterIndex: number) => {
      // Update UI state immediately for responsiveness
      setActivePartIndex(partIndex);
      setActiveChapterIndex(chapterIndex);

      transitionRef.current?.kill();
      const transition = gsap.timeline();
      transitionRef.current = transition;
      transition.to({ v: 0 }, {
        v: 1,
        duration: 1.5,
        ease: "power2.inOut",
        onUpdate() {
          setFade((this.targets()[0] as { v: number }).v);
        },
        onComplete() {
          setVisiblePartIndex(partIndex);
          setVisibleChapterIndex(chapterIndex);
          setShowLoader(true);
        },
      });

      // Special case: Extend loader duration for Part 1 (Loader A) to let audio play
      const loaderDuration = partIndex === 0 ? 7.0 : 2.5;
      transition.to({}, { duration: loaderDuration });

      transition.call(() => {
        setShowLoader(false);
      });

      transition.to({ v: 1 }, {
        v: 0,
        duration: 1.5,
        ease: "power2.inOut",
        onUpdate() {
          setFade((this.targets()[0] as { v: number }).v);
        },
      });

    },
    [],
  );
  
  const handleToggleSound = () => {
    let nextSoundEnabled: boolean;
    if (!soundEnabled || soundBlocked) {
      nextSoundEnabled = true;
      setSoundEnabled(true);
      setSoundBlocked(false);
    } else {
      nextSoundEnabled = false;
      setSoundEnabled(false);
    }

    void updatePreferences({ soundEnabled: nextSoundEnabled });
  };

  return (
    <SoundProvider value={{ soundEnabled, soundBlocked }}>
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {isShowcaseChapter ? (
          <ShowcaseBackgroundVideo
            key={mediaQuality}
            isVisible={!preloaderVisible}
            activeSceneIndex={showcaseSceneIndex}
            shouldPlay={!preloaderVisible}
            quality={mediaQuality}
          />
        ) : null}
        {isShowcaseChapter ? <ShowcaseLyricsDisplay activeSceneIndex={showcaseSceneIndex} isActive={isShowcaseChapter} /> : null}
        <ModelPreloader />
        <CanvasErrorBoundary key={`part-${visiblePartIndex}-chapter-${visibleChapterIndex}`}>
          <Canvas
            dpr={[1, 1]}
            gl={{
              alpha: true,
              antialias: false,
              powerPreference: "default",
              stencil: false,
              depth: true
            }}
            style={{
              position: "relative",
              zIndex: 1,
              width: "100%",
              height: "100%",
              background: "transparent",
              opacity: preloaderVisible ? 0 : 1,
              transition: "opacity 0.6s ease",
            }}
            onCreated={({ gl }) => {
              gl.setClearAlpha(0);
            }}
            camera={{ position: [0, 0, 5], fov: 75, far: 10000 }}
          >
            <PerformanceMonitor
              factor={1}
              threshold={0.9}
              bounds={(refreshrate) => [refreshrate * 0.5, refreshrate * 0.9]}
              onDecline={() => undefined}
            />
            <AdaptiveDpr pixelated />
            {!isShowcaseChapter ? <color attach="background" args={["black"]} /> : null}
            {devToolsEnabled && debugEnabled && <DebugWrapper enabled={debugEnabled} />}
            <CameraRig
              key={`${sceneIndex}-${visiblePartIndex}-${visibleChapterIndex}`}
              sceneIndex={sceneIndex}
              currentPart={visiblePartIndex + 1}
              currentChapter={visibleChapterIndex + 1}
              enabled={cameraEnabled}
            />
            <Suspense fallback={null}>
              <SceneManager
                
                
                scenesHidden={scenesHidden}
                onGoHome={onGoHome}
                onShowcaseSceneChange={setShowcaseSceneIndex}
                onShowcaseProgressChange={setShowcaseChapterProgress}
              />
            </Suspense>
            <pointLight position={[0, 5, 0]} intensity={1} color="white" />
            <OrbitControls
              ref={controlsRef}
              makeDefault
              enabled={!preloaderVisible && !shouldShowLoader && !isShowcaseChapter}
              enableRotate={!isShowcaseChapter}
              enablePan={false}
              enableZoom={
                !isShowcaseChapter && !(
                  (visiblePartIndex === 0 && visibleChapterIndex === 3) ||
                  (visiblePartIndex === 0 && visibleChapterIndex === 0)
                )
              }
              enableDamping
              dampingFactor={0.05}
            />
          </Canvas>
        </CanvasErrorBoundary>
        {!preloaderVisible && (
          <>
            <FadeOverlay opacity={fade} />
            <LoaderOverlay visible={shouldShowLoader} variant={loaderVariant} text={loaderText} />
          </>
        )}
        <LoaderOverlay visible={preloaderVisible} variant="pre" text={progressLabel} />
        {isShowcaseChapter && !preloaderVisible ? (
          <ShowcaseChapterProgress value={showcaseChapterProgress} />
        ) : (
          <button className="loaderSoundButton" type="button" onClick={handleToggleSound}>
            {soundEnabled && !soundBlocked ? "Sound On" : "Enable Sound"}
          </button>
        )}
        {!preloaderVisible && (
          <ChapterNav
            parts={parts}
            activePartIndex={activePartIndex}
            activeChapterIndex={activeChapterIndex}
            onSelectionChange={handleSelectionChange}
            onGoHome={onGoHome}
          />
        )}
        {!isShowcaseChapter && <ButterflySwarm />}
        {/* Debug panel rendered outside Canvas to avoid R3F reconciler issues */}
        <DebugPanel enabled={devToolsEnabled && debugEnabled} />
        {/* ScrollIndicator rendered outside Canvas to avoid R3F reconciler issues */}
        <ScrollIndicator />
      </div>
    </SoundProvider>
  );
}
