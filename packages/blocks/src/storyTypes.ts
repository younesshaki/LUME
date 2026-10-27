export type StoryProgressPayload = Record<string, unknown>;

export type StoryCheckpoint = {
  partId: string;
  chapterId: string;
  sceneId: string | null;
  progress: number;
  payload?: StoryProgressPayload;
  savedAt: string;
};

export type StoryFlag = {
  key: string;
  value: boolean;
  sourceId?: string;
  updatedAt: string;
};

export type StoryChoice = {
  sceneId: string;
  choiceId: string;
  payload?: StoryProgressPayload;
  recordedAt: string;
};

export type StoryAnalytics = {
  sceneDurationsMs: Record<string, number>;
  currentSceneId: string | null;
  currentSceneEnteredAt: string | null;
  finalChoicePromptStartedAt: string | null;
  finalChoiceResponseMs: number | null;
};

export type StoryAchievement = {
  id: string;
  unlockedAt: string;
};

export type StoryPreferences = {
  soundEnabled: boolean;
};

export type StoryState = {
  version: number;
  currentPartId: string;
  currentChapterId: string;
  currentSceneId: string | null;
  visitedSceneIds: string[];
  completedSceneIds: string[];
  completedChapterIds: string[];
  flags: Record<string, StoryFlag>;
  choices: StoryChoice[];
  analytics: StoryAnalytics;
  achievements: Record<string, StoryAchievement>;
  preferences: StoryPreferences;
  resumeCheckpoint: StoryCheckpoint | null;
  updatedAt: string;
};

export type SceneBehaviorType = "cinematic" | "interactive" | "hybrid";
export type SceneProgressionMode = "time" | "scroll" | "choice" | "manual";

export type SceneDefinition = {
  id: string;
  title: string;
  behaviorType: SceneBehaviorType;
  progressionMode: SceneProgressionMode;
  checkpointEligible: boolean;
  unlocksEmitted?: string[];
  choicePoints?: string[];
  durationSeconds?: number;
};

export type ChapterDefinition = {
  id: string;
  title: string;
  mode: SceneBehaviorType;
  unlockPrerequisites?: string[];
  scenes: SceneDefinition[];
};

export type PartDefinition = {
  id: string;
  title: string;
  chapters: ChapterDefinition[];
};

export type AuthorPreviewState = {
  simulatedFlags: string[];
  resumeOverride: StoryCheckpoint | null;
};

export interface StoryService {
  getState(): StoryState;
  loadState(): Promise<StoryState>;
  subscribe(listener: (state: StoryState) => void): () => void;
  setCurrentLocation(partId: string, chapterId: string, sceneId?: string | null): Promise<StoryState>;
  saveCheckpoint(
    partId: string,
    chapterId: string,
    sceneId: string | null,
    progress: number,
    payload?: StoryProgressPayload
  ): Promise<StoryState>;
  recordChoice(
    sceneId: string,
    choiceId: string,
    payload?: StoryProgressPayload
  ): Promise<StoryState>;
  setAnalytics(analytics: StoryAnalytics): Promise<StoryState>;
  unlockFlag(flagKey: string, sourceId?: string): Promise<StoryState>;
  completeScene(sceneId: string): Promise<StoryState>;
  completeChapter(chapterId: string): Promise<StoryState>;
  updatePreferences(preferences: Partial<StoryPreferences>): Promise<StoryState>;
  resetState(): Promise<StoryState>;
}
