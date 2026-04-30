import type { NarrativeScene } from "../../../shared/narrativeTypes";

export const scene8: NarrativeScene = {
  id: "showcase-scene-8",
  title: "Differentiation",
  behavior: "cinematic",
  duration: 25,
  mode: "3d",
  position: { x: 0, y: 0, align: "center" },
  lines: [
    { text: "Make the difference easy to understand." },
    { text: "Not everything needs to be louder." },
    { text: "Sometimes one comparison is enough." },
    { text: "Show what LUME does differently", flipWords: {
        target: "differently",
        words: ["differently", "cleaner", "smarter"],
        intervalMs: 1500,
        finalHoldMs: 1500,
      }, },
    { text: "The contrast should feel immediate." },
  ],
};
