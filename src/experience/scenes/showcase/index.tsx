import { useCallback, useEffect, useRef, useState } from "react";
import { useGLTF } from "@react-three/drei";
import { ShowcaseScene } from "./ShowcaseScene";
import { ShowcaseNarrative } from "./ShowcaseNarrative";
import { useShowcaseTimeline } from "./ShowcaseTimeline";
import { useShowcaseSceneMusic } from "./useShowcaseSceneMusic";
import { useActiveNarrativeScene } from "../shared/useActiveNarrativeScene";
import { getShowcaseChapterConfig } from "./data";
import { showcaseSceneAssets } from "./data/sceneAssets";
import { ProductChoiceScene } from "./ProductChoiceScene";
import { Scene12 } from "./Scene12";
import { SecondaryCtaScene } from "./SecondaryCtaScene";
import { useStory } from "../../story/StoryProvider";
import type { StoryAnalytics } from "../../story/types";
import { logStoryEvent } from "../../../lib/eventsService";

type ShowcasePhase = "cinematic" | "productChoice" | "scene12" | "ending";

type ShowcaseChapterProps = {
  isActive?: boolean;
  chapterId?: string | null;
  onGoHome?: () => void;
  onSceneChange?: (index: number) => void;
  onProgressChange?: (progress: number) => void;
};

export default function ShowcaseChapter({
  isActive = true,
  chapterId,
  onGoHome,
  onSceneChange,
  onProgressChange,
}: ShowcaseChapterProps) {
  const config = getShowcaseChapterConfig(chapterId);
  const scenes = config.scenes;
  const overlayRef = useRef<HTMLDivElement>(null);
  const activeScene = useActiveNarrativeScene(overlayRef, scenes, isActive);
  const [phase, setPhase] = useState<ShowcasePhase>("cinematic");

  // Preload all 3D models in the background as soon as the chapter mounts.
  // They're only needed at scene 12, so we intentionally excluded them from the
  // preloader gate, so they should be ready by the final product scene.
  useEffect(() => {
    if (!config.hasFinalChoice) {
      return;
    }
    Object.values(showcaseSceneAssets.models).forEach((url) => useGLTF.preload(url));
  }, [config.hasFinalChoice]);
  const finalChoiceSceneId = "showcase-scene-11";
  const endingSceneId = "showcase-ending";
  const scene12Id = "showcase-scene-12";
  const trackedSceneIdRef = useRef<string | null>(null);
  const trackedSceneStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    setPhase("cinematic");
    trackedSceneIdRef.current = null;
    trackedSceneStartedAtRef.current = null;
  }, [config.chapterId]);

  const activeSceneIndex = scenes.findIndex((s) => s.id === activeScene.id);
  const safeSceneIndex = activeSceneIndex >= 0 ? activeSceneIndex : 0;
  const cinematicSceneId = activeScene.id && safeSceneIndex >= 0 ? activeScene.id : null;
  const trackedStorySceneId =
    phase === "cinematic"
      ? cinematicSceneId
      : phase === "productChoice"
        ? finalChoiceSceneId
        : phase === "scene12"
          ? scene12Id
          : endingSceneId;

  useEffect(() => {
    // Pass the raw activeSceneIndex (including -1 when no scene is active yet)
    // so the parent stays dormant until the GSAP timeline confirms scene 0.
    onSceneChange?.(activeSceneIndex);
  }, [activeSceneIndex, onSceneChange]);

  useEffect(() => {
    if (!isActive) {
      onProgressChange?.(0);
      return;
    }

    if (phase !== "cinematic") {
      onProgressChange?.(100);
      return;
    }

    const completedSceneCount = Math.max(0, activeSceneIndex);
    onProgressChange?.((completedSceneCount / scenes.length) * 100);
  }, [activeSceneIndex, isActive, onProgressChange, phase, scenes.length]);

  const { recordChoice, setAnalytics, setCurrentLocation, state: storyState } = useStory();

  const useProductChoiceMusic = phase === "productChoice" || phase === "scene12";
  const musicActive = isActive && (phase === "cinematic" || useProductChoiceMusic);
  useShowcaseSceneMusic(safeSceneIndex, musicActive, useProductChoiceMusic);

  const persistTrackedSceneState = useCallback(
    async (sceneId: string, analytics: StoryAnalytics) => {
      await setCurrentLocation("showcase", config.chapterId, sceneId);
      await setAnalytics(analytics);
    },
    [config.chapterId, setAnalytics, setCurrentLocation]
  );

  useEffect(() => {
    if (!isActive || !trackedStorySceneId) {
      return;
    }

    if (trackedSceneIdRef.current === trackedStorySceneId) {
      return;
    }

    const nowMs = Date.now();
    const nextSceneDurationsMs = {
      ...storyState.analytics.sceneDurationsMs,
    };
    const previousSceneId = trackedSceneIdRef.current;
    const previousStartedAt = trackedSceneStartedAtRef.current;

    if (
      previousSceneId &&
      previousStartedAt !== null &&
      previousSceneId !== trackedStorySceneId
    ) {
      nextSceneDurationsMs[previousSceneId] =
        (nextSceneDurationsMs[previousSceneId] ?? 0) + (nowMs - previousStartedAt);
    }

    const currentSceneEnteredAt = new Date(nowMs).toISOString();
    const nextAnalytics: StoryAnalytics = {
      ...storyState.analytics,
      sceneDurationsMs: nextSceneDurationsMs,
      currentSceneId: trackedStorySceneId,
      currentSceneEnteredAt,
      finalChoicePromptStartedAt:
        trackedStorySceneId === finalChoiceSceneId
          ? storyState.analytics.finalChoicePromptStartedAt ?? currentSceneEnteredAt
          : storyState.analytics.finalChoicePromptStartedAt,
      finalChoiceResponseMs:
        trackedStorySceneId === finalChoiceSceneId &&
        previousSceneId !== finalChoiceSceneId
          ? null
          : storyState.analytics.finalChoiceResponseMs,
    };

    trackedSceneIdRef.current = trackedStorySceneId;
    trackedSceneStartedAtRef.current = nowMs;

    void persistTrackedSceneState(trackedStorySceneId, nextAnalytics);
  }, [
    finalChoiceSceneId,
    isActive,
    persistTrackedSceneState,
    storyState.analytics,
    trackedStorySceneId,
  ]);

  const handleAllScenesComplete = useCallback(() => {
    if (config.hasFinalChoice) {
      setPhase("productChoice");
      return;
    }

    void logStoryEvent({
      type: "chapter_completed",
      payload: { chapterId: config.chapterId },
    });
    onGoHome?.();
  }, [config.chapterId, config.hasFinalChoice, onGoHome]);

  useShowcaseTimeline({
    overlayRef,
    isActive: isActive && phase === "cinematic",
    onAllScenesComplete: handleAllScenesComplete,
  });

  const handleYes = useCallback(async () => {
    const nowMs = Date.now();
    const promptStartedAt = storyState.analytics.finalChoicePromptStartedAt;
    const responseTimeMs = promptStartedAt
      ? Math.max(0, nowMs - new Date(promptStartedAt).getTime())
      : null;

    await setAnalytics({
      ...storyState.analytics,
      finalChoiceResponseMs: responseTimeMs,
    });
    await recordChoice(finalChoiceSceneId, "yes", {
      responseTimeMs,
      selectedAt: new Date(nowMs).toISOString(),
    });
    void logStoryEvent({
      type: "choice_made",
      sceneId: finalChoiceSceneId,
      choiceId: "yes",
      payload: {
        responseTimeMs,
        selectedAt: new Date(nowMs).toISOString(),
      },
    });
    setPhase("scene12");
  }, [finalChoiceSceneId, recordChoice, setAnalytics, storyState.analytics]);

  const handleNo = useCallback(async () => {
    const nowMs = Date.now();
    const promptStartedAt = storyState.analytics.finalChoicePromptStartedAt;
    const responseTimeMs = promptStartedAt
      ? Math.max(0, nowMs - new Date(promptStartedAt).getTime())
      : null;

    await setAnalytics({
      ...storyState.analytics,
      finalChoiceResponseMs: responseTimeMs,
    });
    await recordChoice(finalChoiceSceneId, "no", {
      responseTimeMs,
      selectedAt: new Date(nowMs).toISOString(),
    });
    void logStoryEvent({
      type: "choice_made",
      sceneId: finalChoiceSceneId,
      choiceId: "no",
      payload: {
        responseTimeMs,
        selectedAt: new Date(nowMs).toISOString(),
      },
    });
    setPhase("ending");
  }, [finalChoiceSceneId, recordChoice, setAnalytics, storyState.analytics]);

  const handleScene12Complete = useCallback(() => {
    void logStoryEvent({
      type: "chapter_completed",
      payload: { ending: "yes" },
    });
    onGoHome?.();
  }, [onGoHome]);

  const handleEndingDone = useCallback(() => {
    void logStoryEvent({
      type: "chapter_completed",
      payload: { ending: "no" },
    });
    onGoHome?.();
  }, [onGoHome]);

  return (
    <>
      <ShowcaseScene isActive={isActive} activeSceneId={activeScene.id} />
      {phase === "cinematic" && (
        <ShowcaseNarrative isActive={isActive} overlayRef={overlayRef} scenes={scenes} />
      )}
      {phase === "productChoice" && (
        <ProductChoiceScene onYes={handleYes} onNo={handleNo} />
      )}
      {phase === "scene12" && (
        <Scene12 onComplete={handleScene12Complete} />
      )}
      {phase === "ending" && (
        <SecondaryCtaScene onDone={handleEndingDone} />
      )}
    </>
  );
}
