import type { ChapterDefinition, PartDefinition, SceneDefinition } from "./types";

const cinematicScene = (id: string, title: string, durationSeconds?: number): SceneDefinition => ({
  id,
  title,
  behaviorType: "cinematic",
  progressionMode: "time",
  checkpointEligible: true,
  durationSeconds,
});

const chapter = (
  id: string,
  title: string,
  mode: ChapterDefinition["mode"],
  scenes: SceneDefinition[] = []
): ChapterDefinition => ({
  id,
  title,
  mode,
  scenes,
});

export const storyManifest: PartDefinition[] = [
  {
    id: "part-1",
    title: "Foundation",
    chapters: [
      chapter("part-1-chapter-1", "First Light", "cinematic", [
        cinematicScene("scene-1", "The Memory", 29),
        cinematicScene("scene-2a", "The Rebellion", 20),
        cinematicScene("scene-2b", "The Rule Changed", 16),
        cinematicScene("scene-3a", "The Watchers"),
        cinematicScene("scene-3b", "The Watching"),
        cinematicScene("scene-4a", "The Pressure"),
        cinematicScene("scene-4b", "The Weight"),
        cinematicScene("scene-5", "The Crack"),
      ]),
      chapter("part-1-chapter-2", "The Voice", "hybrid"),
      chapter("part-1-chapter-3", "Chosen", "interactive"),
      chapter("part-1-chapter-4", "The Covenant", "hybrid"),
    ],
  },
  {
    id: "part-2",
    title: "Trials",
    chapters: [
      chapter("part-2-chapter-1", "Into the Unknown", "hybrid"),
      chapter("part-2-chapter-2", "The Abyss", "hybrid"),
      chapter("part-2-chapter-3", "Rebirth", "hybrid"),
      chapter("part-2-chapter-4", "Return", "hybrid"),
    ],
  },
  {
    id: "part-3",
    title: "Exile",
    chapters: [
      chapter("part-3-chapter-1", "Banishment", "hybrid"),
      chapter("part-3-chapter-2", "Wasteland", "hybrid"),
      chapter("part-3-chapter-3", "Remnants", "hybrid"),
      chapter("part-3-chapter-4", "Embers", "hybrid"),
    ],
  },
  {
    id: "part-4",
    title: "Ascension",
    chapters: [
      chapter("part-4-chapter-1", "Summit", "hybrid"),
      chapter("part-4-chapter-2", "Aether", "hybrid"),
      chapter("part-4-chapter-3", "Revelation", "hybrid"),
      chapter("part-4-chapter-4", "Crown", "hybrid"),
    ],
  },
  {
    id: "part-5",
    title: "Echoes",
    chapters: [
      chapter("part-5-chapter-1", "Afterglow", "hybrid"),
      chapter("part-5-chapter-2", "Resonance", "hybrid"),
      chapter("part-5-chapter-3", "Horizon", "hybrid"),
      chapter("part-5-chapter-4", "Legacy", "hybrid"),
    ],
  },
  {
    id: "part-6",
    title: "Finale",
    chapters: [
      chapter("part-6-chapter-1", "Chapter 1", "hybrid"),
      chapter("part-6-chapter-2", "Chapter 2", "hybrid"),
      chapter("part-6-chapter-3", "Chapter 3", "hybrid"),
      chapter("part-6-chapter-4", "Chapter 4", "hybrid"),
      chapter("part-6-chapter-5", "Chapter 5", "hybrid"),
    ],
  },
  {
    id: "showcase",
    title: "Showcase",
    chapters: [
      chapter("showcase-chapter-1", "Showcase", "cinematic", [
        cinematicScene("showcase-scene-1", "Showcase"),
        cinematicScene("showcase-scene-2", "Signal"),
        cinematicScene("showcase-scene-3", "Reveal"),
        cinematicScene("showcase-scene-4", "Craft"),
        cinematicScene("showcase-scene-5", "Experience"),
        cinematicScene("showcase-scene-6", "Trust"),
        cinematicScene("showcase-scene-7", "Benefits"),
        cinematicScene("showcase-scene-8", "Differentiation"),
        cinematicScene("showcase-scene-9", "Momentum"),
        cinematicScene("showcase-scene-10", "Statement"),
        cinematicScene("showcase-scene-11", "Choice"),
        cinematicScene("showcase-scene-12", "Product"),
      ]),
    ],
  },
];

export const getPartDefinition = (partNumber: number) =>
  storyManifest[partNumber - 1] ?? null;

export const getChapterDefinition = (partNumber: number, chapterNumber: number) =>
  getPartDefinition(partNumber)?.chapters[chapterNumber - 1] ?? null;

export const getChapterIndicesById = (chapterId: string) => {
  for (let partIndex = 0; partIndex < storyManifest.length; partIndex += 1) {
    const chapterIndex = storyManifest[partIndex].chapters.findIndex(
      (chapterDefinition) => chapterDefinition.id === chapterId
    );
    if (chapterIndex !== -1) {
      return { partIndex, chapterIndex };
    }
  }

  return null;
};

export const getFirstSceneId = (chapterDefinition: ChapterDefinition | null) =>
  chapterDefinition?.scenes[0]?.id ?? null;
