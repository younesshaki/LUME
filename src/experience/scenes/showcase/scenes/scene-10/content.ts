import type { NarrativeScene } from "../../../shared/narrativeTypes";

export const scene10: NarrativeScene = {
  id: "showcase-scene-10",
  title: "Statement",
  behavior: "cinematic",
  duration: 25,
  mode: "3d",
  position: { x: 0, y: 0, align: "center" },
  lines: [
    { text: "LUME is designed to feel precise, modern, and useful.", flipWords: {
        target: "precise",
        words: ["precise", "modern", "useful"],
        intervalMs: 1500,
        finalHoldMs: 1500,
      }, },
    { text: "Every transition should support the product, not distract from it." },
    { text: "Every visual should reveal something real." },
    { text: "Every line should earn its place." },
    { text: "The showcase ends by making the next step feel natural." },
  ],
};
