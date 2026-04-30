import { storyManifest, getChapterIndicesById } from "./manifest";
import type { StoryState, ChapterDefinition, PartDefinition } from "./types";

export type ChapterStatus = "locked" | "available" | "in-progress" | "completed";

export type ChapterDisplayInfo = {
  definition: ChapterDefinition;
  partDefinition: PartDefinition;
  partIndex: number;
  chapterIndex: number;
  status: ChapterStatus;
  sceneCount: number;
  completedSceneCount: number;
};

export type PartDisplayInfo = {
  definition: PartDefinition;
  partIndex: number;
  chapters: ChapterDisplayInfo[];
  completedChapterCount: number;
  totalChapterCount: number;
};

export type ResumeTarget = {
  partId: string;
  chapterId: string;
  partIndex: number;
  chapterIndex: number;
  partTitle: string;
  chapterTitle: string;
} | null;

/**
 * Compute the global ordering index of a chapter in the manifest.
 * Returns -1 if not found.
 */
function getGlobalChapterIndex(chapterId: string): number {
  let index = 0;
  for (const part of storyManifest) {
    for (const ch of part.chapters) {
      if (ch.id === chapterId) return index;
      index++;
    }
  }
  return -1;
}

/**
 * Determine the status of a chapter based on story state.
 * Chapters before the current one are implicitly completed.
 * Chapters are unlocked sequentially — a chapter is available
 * if the previous one is completed (or it's the very first).
 */
function resolveChapterStatus(
  chapterId: string,
  isFirst: boolean,
  previousCompleted: boolean,
  state: StoryState,
  currentGlobalIndex: number
): ChapterStatus {
  if (state.completedChapterIds.includes(chapterId)) {
    return "completed";
  }

  if (state.currentChapterId === chapterId) {
    return "in-progress";
  }

  // If this chapter comes before the current chapter, it's implicitly completed
  const thisIndex = getGlobalChapterIndex(chapterId);
  if (thisIndex !== -1 && thisIndex < currentGlobalIndex) {
    return "completed";
  }

  if (isFirst || previousCompleted) {
    return "available";
  }

  return "locked";
}

/**
 * Compute display info for every chapter in the manifest.
 */
export function getPartDisplayList(state: StoryState): PartDisplayInfo[] {
  let previousChapterCompleted = false;
  let isFirstOverall = true;
  const currentGlobalIndex = getGlobalChapterIndex(state.currentChapterId);

  return storyManifest.map((part, partIndex) => {
    const chapters: ChapterDisplayInfo[] = part.chapters.map(
      (chapter, chapterIndex) => {
        const status = resolveChapterStatus(
          chapter.id,
          isFirstOverall,
          previousChapterCompleted,
          state,
          currentGlobalIndex
        );

        const completedSceneCount = chapter.scenes.filter((scene) =>
          state.completedSceneIds.includes(scene.id)
        ).length;

        previousChapterCompleted = status === "completed";
        isFirstOverall = false;

        return {
          definition: chapter,
          partDefinition: part,
          partIndex,
          chapterIndex,
          status,
          sceneCount: chapter.scenes.length,
          completedSceneCount,
        };
      }
    );

    return {
      definition: part,
      partIndex,
      chapters,
      completedChapterCount: chapters.filter((c) => c.status === "completed").length,
      totalChapterCount: chapters.length,
    };
  });
}

/**
 * Determine where the user should resume from.
 * Prefers the saved checkpoint, then falls back to current location.
 */
export function getResumeTarget(state: StoryState): ResumeTarget {
  const chapterId =
    state.resumeCheckpoint?.chapterId ?? state.currentChapterId;

  const indices = getChapterIndicesById(chapterId);
  if (!indices) return null;

  const part = storyManifest[indices.partIndex];
  const chapter = part?.chapters[indices.chapterIndex];
  if (!part || !chapter) return null;

  return {
    partId: part.id,
    chapterId: chapter.id,
    partIndex: indices.partIndex,
    chapterIndex: indices.chapterIndex,
    partTitle: part.title,
    chapterTitle: chapter.title,
  };
}

/**
 * Whether there is meaningful progress to resume
 * (i.e., a checkpoint exists or user has visited scenes).
 */
export function hasProgress(state: StoryState): boolean {
  return (
    state.resumeCheckpoint !== null ||
    state.visitedSceneIds.length > 0 ||
    state.completedChapterIds.length > 0
  );
}
