import type { NarrativeScene } from "../../../shared/narrativeTypes";

export const scene1: NarrativeScene = {
  id: "showcase-scene-1",
  title: "Showcase",
  behavior: "cinematic",
  duration: 25,
  mode: "3d",
  position: { x: 0, y: 0, align: "center" },
  lines: [
    {
      text: "A Cinematic product showcase for LUME.",
      blankBeforeMs: 6500,
      flipWords: {
        target: "Cinematic",
        words: ["Cinematic", "immersive", "focused", "memorable"],
        intervalMs: 1500,
        finalHoldMs: 1500,
      },
    },
    { text: "Built to make the product feel tangible before a visitor touches it." },
    { text: "Every scene can carry a feature, a detail, or a proof point.", highlights: ["feature"], flipWords: {
        target: "feature",
        words: ["feature", "detail", "benefit"],
        intervalMs: 1500,
        finalHoldMs: 1500,
      }, },
    { text: "The structure is ready." },
    { text: "The brand story can now take its place." },
  ],
};
