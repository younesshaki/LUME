import type { NarrativeScene } from "../../../shared/narrativeTypes";

export const scene5: NarrativeScene = {
  id: "showcase-scene-5",
  title: "Experience",
  behavior: "cinematic",
  duration: 25,
  mode: "3d",
  position: { x: 0, y: 0, align: "center" },
  lines: [
    { text: "Move from object to experience." },
    { text: "Show where LUME lives in the customer's world.", blankBeforeMs: 5000 },
    { text: "Context turns features into meaning." },
    { text: "A product is easier to remember when the use case feels real." },
    { text: "This scene can hold lifestyle footage, UI flows, or product-in-hand moments." },
  ],
};
