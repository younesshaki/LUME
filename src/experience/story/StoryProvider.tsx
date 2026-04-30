import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { localStoryService } from "./service/localStoryService";
import { supabaseStoryService } from "./service/supabaseStoryService";
import type {
  StoryAnalytics,
  StoryProgressPayload,
  StoryService,
  StoryState,
} from "./types";

type StoryContextValue = {
  isReady: boolean;
  state: StoryState;
  service: StoryService;
  setCurrentLocation: (partId: string, chapterId: string, sceneId?: string | null) => Promise<StoryState>;
  saveCheckpoint: (
    partId: string,
    chapterId: string,
    sceneId: string | null,
    progress: number,
    payload?: StoryProgressPayload
  ) => Promise<StoryState>;
  recordChoice: (
    sceneId: string,
    choiceId: string,
    payload?: StoryProgressPayload
  ) => Promise<StoryState>;
  setAnalytics: (analytics: StoryAnalytics) => Promise<StoryState>;
  unlockFlag: (flagKey: string, sourceId?: string) => Promise<StoryState>;
  completeScene: (sceneId: string) => Promise<StoryState>;
  completeChapter: (chapterId: string) => Promise<StoryState>;
  updatePreferences: (preferences: Partial<StoryState["preferences"]>) => Promise<StoryState>;
  resetState: () => Promise<StoryState>;
};

export const StoryContext = createContext<StoryContextValue | null>(null);

const useBackend = import.meta.env.VITE_USE_BACKEND === "true";

export function StoryProvider({ children }: PropsWithChildren) {
  const [service, setService] = useState<StoryService>(localStoryService);
  const [state, setState] = useState(localStoryService.getState());
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      let activeService: StoryService = localStoryService;

      if (useBackend) {
        try {
          await supabaseStoryService.loadState();
          activeService = supabaseStoryService;
        } catch (err) {
          console.warn(
            "[StoryProvider] Backend init failed, falling back to local:",
            err
          );
          activeService = localStoryService;
        }
      }

      if (cancelled) return;

      // Load state from the active service
      try {
        await activeService.loadState();
      } catch {
        // If even local fails, service keeps its default state
      }

      if (cancelled) return;

      setService(activeService);
      setState(activeService.getState());
      setIsReady(true);
    };

    boot();

    return () => {
      cancelled = true;
    };
  }, []);

  // Subscribe to the active service
  useEffect(() => {
    const unsubscribe = service.subscribe(setState);
    return unsubscribe;
  }, [service]);

  const setCurrentLocation = useCallback(
    (partId: string, chapterId: string, sceneId?: string | null) =>
      service.setCurrentLocation(partId, chapterId, sceneId),
    [service]
  );
  const saveCheckpoint = useCallback(
    (
      partId: string,
      chapterId: string,
      sceneId: string | null,
      progress: number,
      payload?: StoryProgressPayload
    ) => service.saveCheckpoint(partId, chapterId, sceneId, progress, payload),
    [service]
  );
  const recordChoice = useCallback(
    (sceneId: string, choiceId: string, payload?: StoryProgressPayload) =>
      service.recordChoice(sceneId, choiceId, payload),
    [service]
  );
  const setAnalytics = useCallback(
    (analytics: StoryAnalytics) => service.setAnalytics(analytics),
    [service]
  );
  const unlockFlag = useCallback(
    (flagKey: string, sourceId?: string) => service.unlockFlag(flagKey, sourceId),
    [service]
  );
  const completeScene = useCallback(
    (sceneId: string) => service.completeScene(sceneId),
    [service]
  );
  const completeChapter = useCallback(
    (chapterId: string) => service.completeChapter(chapterId),
    [service]
  );
  const updatePreferences = useCallback(
    (preferences: Partial<StoryState["preferences"]>) => service.updatePreferences(preferences),
    [service]
  );
  const resetState = useCallback(() => service.resetState(), [service]);

  const value = useMemo<StoryContextValue>(
    () => ({
      isReady,
      state,
      service,
      setCurrentLocation,
      saveCheckpoint,
      recordChoice,
      setAnalytics,
      unlockFlag,
      completeScene,
      completeChapter,
      updatePreferences,
      resetState,
    }),
    [
      completeChapter,
      completeScene,
      isReady,
      recordChoice,
      resetState,
      saveCheckpoint,
      service,
      setAnalytics,
      setCurrentLocation,
      state,
      unlockFlag,
      updatePreferences,
    ]
  );

  return <StoryContext.Provider value={value}>{children}</StoryContext.Provider>;
}

export function useStory() {
  const context = useContext(StoryContext);
  if (!context) {
    throw new Error("useStory must be used within a StoryProvider");
  }

  return context;
}
