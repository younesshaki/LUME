import type { NarrativeScene } from "../../../shared/narrativeTypes";

export const scene6: NarrativeScene = {
  id: "showcase-scene-6",
  title: "Trust",
  behavior: "cinematic",
  duration: 25,
  mode: "3d",
  position: { x: 0, y: 0, align: "center" },
  lines: [
    { text: "Build trust with concrete proof." },
    { text: "Performance, durability, safety, and support.", flipWords: {
        target: "proof",
        words: ["proof", "testing", "reliability"],
        intervalMs: 1700,
        finalHoldMs: 1500,
      }, },
    { text: "Replace vague claims with evidence." },
    { text: "Use this moment for certifications, metrics, or customer outcomes.", },
    { text: "Confidence grows when the details are specific.", flipWords: {
        target: "specific",
        words: ["specific", "visible", "measurable"],
        intervalMs: 1500,
        finalHoldMs: 1500,
      }, },
  ],
};
