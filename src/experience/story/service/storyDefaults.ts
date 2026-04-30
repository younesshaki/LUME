import { getFirstSceneId, storyManifest } from "../manifest";
import type {
  StoryAchievement,
  StoryAnalytics,
  StoryCheckpoint,
  StoryChoice,
  StoryFlag,
  StoryPreferences,
  StoryState,
} from "../types";

// Legacy global key — kept for one-time migration of pre-user-scoped caches.
export const STORAGE_KEY = "nomad.story-state.v1";

/** User-scoped storage key — prevents one account's cache from shadowing another's state. */
export const getUserScopedStorageKey = (userId: string) =>
  `nomad.story-state.${userId}.v1`;
export const STORY_STATE_VERSION = 1;
export const CONTENT_VERSION = "v1";

export const now = () => new Date().toISOString();

const getDefaultAnalytics = (): StoryAnalytics => ({
  sceneDurationsMs: {},
  currentSceneId: null,
  currentSceneEnteredAt: null,
  finalChoicePromptStartedAt: null,
  finalChoiceResponseMs: null,
});

export const getDefaultState = (): StoryState => {
  const firstPart = storyManifest[0];
  const firstChapter = firstPart.chapters[0];

  return {
    version: STORY_STATE_VERSION,
    currentPartId: firstPart.id,
    currentChapterId: firstChapter.id,
    currentSceneId: getFirstSceneId(firstChapter),
    visitedSceneIds: [],
    completedSceneIds: [],
    completedChapterIds: [],
    flags: {},
    choices: [],
    analytics: getDefaultAnalytics(),
    achievements: {},
    preferences: {
      soundEnabled: true,
    },
    resumeCheckpoint: null,
    updatedAt: now(),
  };
};

const sanitizePreferences = (
  preferences: Partial<StoryPreferences> | undefined
): StoryPreferences => ({
  soundEnabled: preferences?.soundEnabled ?? true,
});

const sanitizeFlags = (flags: Record<string, StoryFlag> | undefined) =>
  flags ?? {};

const sanitizeChoices = (choices: StoryChoice[] | undefined) => choices ?? [];

const sanitizeAnalytics = (
  analytics: Partial<StoryAnalytics> | undefined
): StoryAnalytics => ({
  sceneDurationsMs: analytics?.sceneDurationsMs ?? {},
  currentSceneId: analytics?.currentSceneId ?? null,
  currentSceneEnteredAt: analytics?.currentSceneEnteredAt ?? null,
  finalChoicePromptStartedAt: analytics?.finalChoicePromptStartedAt ?? null,
  finalChoiceResponseMs: analytics?.finalChoiceResponseMs ?? null,
});

const sanitizeAchievements = (
  achievements: Record<string, StoryAchievement> | undefined
) => achievements ?? {};

const sanitizeCheckpoint = (
  checkpoint: StoryCheckpoint | null | undefined
) => {
  if (!checkpoint) {
    return null;
  }

  return {
    partId: checkpoint.partId,
    chapterId: checkpoint.chapterId,
    sceneId: checkpoint.sceneId ?? null,
    progress: checkpoint.progress ?? 0,
    payload: checkpoint.payload,
    savedAt: checkpoint.savedAt ?? now(),
  };
};

export const normalizeState = (
  state: Partial<StoryState> | null | undefined
): StoryState => {
  const base = getDefaultState();
  const nextState = state ?? {};

  return {
    ...base,
    ...nextState,
    version: STORY_STATE_VERSION,
    currentSceneId:
      nextState.currentSceneId ??
      nextState.resumeCheckpoint?.sceneId ??
      base.currentSceneId,
    visitedSceneIds: nextState.visitedSceneIds ?? base.visitedSceneIds,
    completedSceneIds: nextState.completedSceneIds ?? base.completedSceneIds,
    completedChapterIds:
      nextState.completedChapterIds ?? base.completedChapterIds,
    flags: sanitizeFlags(nextState.flags),
    choices: sanitizeChoices(nextState.choices),
    analytics: sanitizeAnalytics(nextState.analytics),
    achievements: sanitizeAchievements(nextState.achievements),
    preferences: sanitizePreferences(nextState.preferences),
    resumeCheckpoint: sanitizeCheckpoint(nextState.resumeCheckpoint),
    updatedAt: nextState.updatedAt ?? now(),
  };
};

/**
 * Read local storage state for a specific user.
 * Falls back to the legacy global key (one-time migration) if no user-scoped entry exists.
 * Returns null if not available or parse fails.
 */
export const readLocalStateIfPresent = (userId?: string): StoryState | null => {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return null;
  }

  const tryParse = (raw: string | null): StoryState | null => {
    if (!raw) return null;
    try {
      return normalizeState(JSON.parse(raw) as Partial<StoryState>);
    } catch {
      return null;
    }
  };

  if (userId) {
    const scoped = tryParse(window.localStorage.getItem(getUserScopedStorageKey(userId)));
    if (scoped) return scoped;
    // No user-scoped cache yet — do NOT fall back to the global key.
    // Falling back would let a previous user's choice leak into a new account.
    return null;
  }

  // Pre-auth read (rare) — use legacy key.
  return tryParse(window.localStorage.getItem(STORAGE_KEY));
};
