import "server-only";
import type { ShowcaseScene } from "../../components/showcase/types";

/** First chapter's opening, signal and reveal. Narrative copied from Vite's
 * scene-{1,2,3}/content.ts; no dependency on its DOM/Three runtime.
 * All three intentionally use the ONE verified catalog model, not the missing
 * hero-product/material-study/product-detail placeholders. Each parse is owned.
 */
export const sceneManifest: Omit<ShowcaseScene, "modelUrl">[] = [
  {
    id: "showcase-scene-1",
    title: "Showcase",
    duration: 25,
    camera: { kind: "crane", orbitStart: 0 },
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
      {
        text: "Built to make the product feel tangible before a visitor touches it.",
      },
      {
        text: "Every scene can carry a feature, a detail, or a proof point.",
        highlights: ["feature"],
        flipWords: {
          target: "feature",
          words: ["feature", "detail", "benefit"],
          intervalMs: 1500,
          finalHoldMs: 1500,
        },
      },
      { text: "The structure is ready." },
      { text: "The brand story can now take its place." },
    ],
  },
  {
    id: "showcase-scene-2",
    title: "Signal",
    duration: 25,
    camera: { kind: "orbit", orbitStart: Math.PI / 2 },
    lines: [
      { text: "Start with the problem your product solves." },
      { text: "Show the friction clearly." },
      { text: "Make the need visible before the solution arrives." },
      { text: "Then let the product answer without over-explaining." },
    ],
  },
  {
    id: "showcase-scene-3",
    title: "Reveal",
    duration: 25,
    camera: { kind: "orbit", orbitStart: Math.PI / 2 + 2 },
    lines: [
      {
        text: "Reveal the product with restraint.",
        flipWords: {
          target: "restraint",
          words: ["restraint", "precision", "clarity"],
          intervalMs: 1500,
          finalHoldMs: 1500,
        },
      },
      { text: "Let motion, light, and pacing create anticipation." },
      { text: "Use copy only where it sharpens the message." },
      { text: "This is where LUME becomes the center of attention." },
      { text: "The visitor should understand what matters first." },
    ],
  },
];

// Server-owned mapping. Neither scene IDs nor asset paths come from the request.
export const modelKeys = {
  "showcase-scene-1":
    "vehicle%20images/3D%20assets/blackredbull6.optimized.glb",
  "showcase-scene-2":
    "vehicle%20images/3D%20assets/blackredbull6.optimized.glb",
  "showcase-scene-3":
    "vehicle%20images/3D%20assets/blackredbull6.optimized.glb",
} as const;
