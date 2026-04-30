import type { NarrativeScene } from "../../../shared/narrativeTypes";

export const scene4: NarrativeScene = {
  id: "showcase-scene-4",
  title: "Craft",
  behavior: "cinematic",
  duration: 25,
  mode: "3d",
  position: { x: 0, y: 0, align: "center" },
  lines: [
    { text: "Show the craft behind the product." },
    { text: "Materials, engineering, process, and finish." },
    { text: "The visitor should feel the difference before reading a spec sheet." },
    { text: "Details matter.", highlights: ["Details", "matter"], },
    { text: "Use this scene for close-ups and tactile proof." },
  ],
};
