"use client";
import type { SceneId } from "./types";

export type StorySnapshot = {
  sceneId: SceneId;
  progress: number;
  sceneProgress: number;
  reduced: boolean;
  consent: "accepted" | "rejected" | null;
  // No AudioContext, media element, fetch or playback until 5d.
  audio: { status: "stubbed"; enabled: false };
};
export function createStoryStore(first: SceneId) {
  let snapshot: StorySnapshot = {
    sceneId: first,
    progress: 0,
    sceneProgress: 0,
    reduced: true,
    consent: null,
    audio: { status: "stubbed", enabled: false },
  };
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update(next: Partial<Omit<StorySnapshot, "audio">>) {
      const changed = Object.entries(next).some(
        ([key, value]) => snapshot[key as keyof typeof next] !== value,
      );
      if (!changed) return;
      snapshot = { ...snapshot, ...next };
      listeners.forEach((listener) => listener());
    },
  };
}
export type StoryStore = ReturnType<typeof createStoryStore>;

export function sceneAt(progress: number, count: number) {
  const bounded = Math.max(
    0,
    Math.min(1, Number.isFinite(progress) ? progress : 0),
  );
  const index = Math.min(count - 1, Math.floor(bounded * count));
  return {
    index,
    progress: bounded,
    sceneProgress: Math.min(1, bounded * count - index),
  };
}
