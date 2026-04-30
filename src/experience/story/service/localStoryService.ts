import {
  STORAGE_KEY,
  getDefaultState,
  normalizeState,
  now,
} from "./storyDefaults";
import type {
  StoryAnalytics,
  StoryCheckpoint,
  StoryChoice,
  StoryPreferences,
  StoryService,
  StoryState,
} from "../types";

const canUseStorage = () =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

class LocalStoryService implements StoryService {
  private state: StoryState = getDefaultState();
  private listeners = new Set<(state: StoryState) => void>();

  getState(): StoryState {
    return this.state;
  }

  async loadState(): Promise<StoryState> {
    if (!canUseStorage()) {
      this.state = getDefaultState();
      return this.state;
    }

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      this.state = getDefaultState();
      this.persist();
      return this.state;
    }

    try {
      this.state = normalizeState(JSON.parse(raw) as Partial<StoryState>);
      this.persist();
    } catch {
      this.state = getDefaultState();
      this.persist();
    }

    this.notify();
    return this.state;
  }

  subscribe(listener: (state: StoryState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async setCurrentLocation(
    partId: string,
    chapterId: string,
    sceneId: string | null = null
  ): Promise<StoryState> {
    return this.commit((state) => ({
      ...state,
      currentPartId: partId,
      currentChapterId: chapterId,
      currentSceneId: sceneId,
    }));
  }

  async saveCheckpoint(
    partId: string,
    chapterId: string,
    sceneId: string | null,
    progress: number,
    payload?: Record<string, unknown>
  ): Promise<StoryState> {
    const checkpoint: StoryCheckpoint = {
      partId,
      chapterId,
      sceneId,
      progress,
      payload,
      savedAt: now(),
    };

    return this.commit((state) => ({
      ...state,
      currentPartId: partId,
      currentChapterId: chapterId,
      currentSceneId: sceneId,
      resumeCheckpoint: checkpoint,
    }));
  }

  async recordChoice(
    sceneId: string,
    choiceId: string,
    payload?: Record<string, unknown>
  ): Promise<StoryState> {
    const nextChoice: StoryChoice = {
      sceneId,
      choiceId,
      payload,
      recordedAt: now(),
    };

    return this.commit((state) => ({
      ...state,
      choices: [
        ...state.choices.filter(
          (existingChoice) => existingChoice.sceneId !== sceneId
        ),
        nextChoice,
      ],
    }));
  }

  async setAnalytics(analytics: StoryAnalytics): Promise<StoryState> {
    return this.commit((state) => ({
      ...state,
      analytics,
    }));
  }

  async unlockFlag(flagKey: string, sourceId?: string): Promise<StoryState> {
    return this.commit((state) => ({
      ...state,
      flags: {
        ...state.flags,
        [flagKey]: {
          key: flagKey,
          value: true,
          sourceId,
          updatedAt: now(),
        },
      },
    }));
  }

  async completeScene(sceneId: string): Promise<StoryState> {
    return this.commit((state) => ({
      ...state,
      visitedSceneIds: Array.from(
        new Set([...state.visitedSceneIds, sceneId])
      ),
      completedSceneIds: Array.from(
        new Set([...state.completedSceneIds, sceneId])
      ),
      currentSceneId: sceneId,
    }));
  }

  async completeChapter(chapterId: string): Promise<StoryState> {
    return this.commit((state) => ({
      ...state,
      completedChapterIds: Array.from(
        new Set([...state.completedChapterIds, chapterId])
      ),
    }));
  }

  async updatePreferences(
    preferences: Partial<StoryPreferences>
  ): Promise<StoryState> {
    return this.commit((state) => ({
      ...state,
      preferences: {
        ...state.preferences,
        ...preferences,
      },
    }));
  }

  async resetState(): Promise<StoryState> {
    this.state = getDefaultState();
    this.persist();
    this.notify();
    return this.state;
  }

  private commit(updater: (state: StoryState) => StoryState): StoryState {
    this.state = {
      ...updater(this.state),
      updatedAt: now(),
    };
    this.persist();
    this.notify();
    return this.state;
  }

  private persist() {
    if (!canUseStorage()) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
  }

  private notify() {
    this.listeners.forEach((listener) => listener(this.state));
  }
}

export const localStoryService = new LocalStoryService();
