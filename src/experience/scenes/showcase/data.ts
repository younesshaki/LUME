import type { NarrativeScene } from "../shared/narrativeTypes";
import { scene1 } from "./scenes/scene-1/content";
import { scene2 } from "./scenes/scene-2/content";
import { scene3 } from "./scenes/scene-3/content";
import { scene4 } from "./scenes/scene-4/content";
import { scene5 } from "./scenes/scene-5/content";
import { scene6 } from "./scenes/scene-6/content";
import { scene7 } from "./scenes/scene-7/content";
import { scene8 } from "./scenes/scene-8/content";
import { scene9 } from "./scenes/scene-9/content";
import { scene10 } from "./scenes/scene-10/content";
import { scene11 } from "./scenes/scene-11/content";

export type ShowcaseChapterConfig = {
  chapterId: string;
  scenes: NarrativeScene[];
  hasBackgroundVideo: boolean;
  hasFinalChoice: boolean;
};

const createPlaceholderScene = (
  id: string,
  title: string,
  lines: string[]
): NarrativeScene => ({
  id,
  title,
  behavior: "cinematic",
  duration: 25,
  mode: "3d",
  position: { x: 0, y: 0, align: "center" },
  lines: lines.map((text) => ({ text })),
});

export const showcaseScenes: NarrativeScene[] = [
  scene1,
  scene2,
  scene3,
  scene4,
  scene5,
  scene6,
  scene7,
  scene8,
  scene9,
  scene10,
  scene11,
];

export const showcaseTwoScenes: NarrativeScene[] = [
  createPlaceholderScene("showcase-2-scene-1", "Opening", [
    "A new product story begins in shadow.",
    "The first impression should feel deliberate.",
    "Every frame can be replaced with final brand copy later.",
  ]),
  createPlaceholderScene("showcase-2-scene-2", "Material", [
    "Show the surface before explaining the feature.",
    "Let texture, weight, and contrast carry the mood.",
    "This scene is ready for a future background video.",
  ]),
  createPlaceholderScene("showcase-2-scene-3", "Ritual", [
    "Build a moment around how the product is used.",
    "Make the ordinary action feel premium.",
    "Keep the copy short and cinematic.",
  ]),
  createPlaceholderScene("showcase-2-scene-4", "Detail", [
    "Move closer to the detail that makes the product memorable.",
    "Use this space for a claim, a proof point, or a sensory cue.",
    "The final wording can be edited here later.",
  ]),
  createPlaceholderScene("showcase-2-scene-5", "Desire", [
    "The product should feel rare without needing to say it.",
    "Let the pacing create anticipation.",
    "Leave room for the final visual asset to lead.",
  ]),
  createPlaceholderScene("showcase-2-scene-6", "Close", [
    "End with a clean statement of value.",
    "Make the next step feel natural.",
    "This placeholder showcase is ready for final media.",
  ]),
];

export const showcaseThreeScenes: NarrativeScene[] = [
  createPlaceholderScene("showcase-3-scene-1", "Signal", [
    "Start with a precise brand signal.",
    "Give the visitor a reason to lean in.",
    "The finished copy can replace this line later.",
  ]),
  createPlaceholderScene("showcase-3-scene-2", "World", [
    "Establish the world around the product.",
    "Use atmosphere, rhythm, and restraint.",
    "The background can stay black until video is ready.",
  ]),
  createPlaceholderScene("showcase-3-scene-3", "Object", [
    "Let the object become the center of attention.",
    "Avoid explaining what the image can show.",
    "Keep one strong idea per scene.",
  ]),
  createPlaceholderScene("showcase-3-scene-4", "Benefit", [
    "Translate the luxury feeling into a clear benefit.",
    "Make the product feel intentional, not decorative.",
    "This line is temporary and easy to edit.",
  ]),
  createPlaceholderScene("showcase-3-scene-5", "Proof", [
    "Use this scene for credibility when the details are ready.",
    "A specification, ingredient, or craft note can live here.",
    "Keep the sentence clean and confident.",
  ]),
  createPlaceholderScene("showcase-3-scene-6", "Signature", [
    "Close on the brand signature.",
    "The final message should feel simple and memorable.",
    "This six-scene version ends here.",
  ]),
];

export const showcaseChapterConfigs: ShowcaseChapterConfig[] = [
  {
    chapterId: "showcase-chapter-1",
    scenes: showcaseScenes,
    hasBackgroundVideo: true,
    hasFinalChoice: true,
  },
  {
    chapterId: "showcase-chapter-2",
    scenes: showcaseTwoScenes,
    hasBackgroundVideo: false,
    hasFinalChoice: false,
  },
  {
    chapterId: "showcase-chapter-3",
    scenes: showcaseThreeScenes,
    hasBackgroundVideo: false,
    hasFinalChoice: false,
  },
];

export function isShowcaseChapterId(chapterId: string | null | undefined): boolean {
  return showcaseChapterConfigs.some((config) => config.chapterId === chapterId);
}

export function getShowcaseChapterConfig(
  chapterId: string | null | undefined
): ShowcaseChapterConfig {
  return (
    showcaseChapterConfigs.find((config) => config.chapterId === chapterId) ??
    showcaseChapterConfigs[0]
  );
}
