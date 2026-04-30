import type { NarrativeScene } from "../../../shared/narrativeTypes";

export const scene3: NarrativeScene = {
  id: "showcase-scene-3",
  title: "Reveal",
  behavior: "cinematic",
  duration: 25,
  mode: "3d",
  position: { x: 0, y: 0, align: "center" },
  lines: [
    { text: "Reveal the product with restraint.", flipWords: {
        target: "restraint",
        words: ["restraint", "precision", "clarity"],
        intervalMs: 1500,
        finalHoldMs: 1500,
      }, },
    { text: "Let motion, light, and pacing create anticipation." },
    { text: "Use copy only where it sharpens the message." },
    { text: "This is where LUME becomes the center of attention." },
    { text: "The visitor should understand what matters first." },
  ],
};
