import type { NarrativeScene } from "../../../shared/narrativeTypes";

export const scene11: NarrativeScene = {
  id: "showcase-scene-11",
  title: "",
  behavior: "cinematic",
  duration: 25,
  mode: "3d",
  position: { x: 0, y: 0, align: "center" },
  lines: [
    {
      text: "This is LUME.",
      highlights: ["LUME"],
      flipWords: {
        target: "LUME",
        words: ["LUME", "Product", "Brand", "Showcase"],
        intervalMs: 1500,
        finalHoldMs: 1500,
      },
    },
  ],
};
