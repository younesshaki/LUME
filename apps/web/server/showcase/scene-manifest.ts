import "server-only";
import type { ShowcaseScene } from "../../components/showcase/types";

/** First chapter through the final Product scene (1–12). Narrative copied from Vite's
 * scene-{1..12}/content.ts; no dependency on its DOM/Three runtime.
 * All twelve intentionally use the ONE verified catalog model, not the missing
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
  {
    id: "showcase-scene-4",
    title: "Craft",
    duration: 25,
    camera: {
      kind: "orbit",
      orbitStart: 5.570796326794897,
    },
    lines: [
      {
        text: "Show the craft behind the product.",
      },
      {
        text: "Materials, engineering, process, and finish.",
      },
      {
        text: "The visitor should feel the difference before reading a spec sheet.",
      },
      {
        text: "Details matter.",
        highlights: ["Details", "matter"],
      },
      {
        text: "Use this scene for close-ups and tactile proof.",
      },
    ],
  },
  {
    id: "showcase-scene-5",
    title: "Experience",
    duration: 25,
    camera: {
      kind: "orbit",
      orbitStart: 7.570796326794897,
    },
    lines: [
      {
        text: "Move from object to experience.",
      },
      {
        text: "Show where LUME lives in the customer's world.",
        blankBeforeMs: 5000,
      },
      {
        text: "Context turns features into meaning.",
      },
      {
        text: "A product is easier to remember when the use case feels real.",
      },
      {
        text: "This scene can hold lifestyle footage, UI flows, or product-in-hand moments.",
      },
    ],
  },
  {
    id: "showcase-scene-6",
    title: "Trust",
    duration: 25,
    camera: {
      kind: "orbit",
      orbitStart: 9.570796326794897,
    },
    lines: [
      {
        text: "Build trust with concrete proof.",
      },
      {
        text: "Performance, durability, safety, and support.",
        flipWords: {
          target: "proof",
          words: ["proof", "testing", "reliability"],
          intervalMs: 1700,
          finalHoldMs: 1500,
        },
      },
      {
        text: "Replace vague claims with evidence.",
      },
      {
        text: "Use this moment for certifications, metrics, or customer outcomes.",
      },
      {
        text: "Confidence grows when the details are specific.",
        flipWords: {
          target: "specific",
          words: ["specific", "visible", "measurable"],
          intervalMs: 1500,
          finalHoldMs: 1500,
        },
      },
    ],
  },
  {
    id: "showcase-scene-7",
    title: "Benefits",
    duration: 25,
    camera: {
      kind: "orbit",
      orbitStart: 11.570796326794897,
    },
    lines: [
      {
        text: "Translate features into benefits.",
      },
      {
        text: "What changes for the customer?",
      },
      {
        text: "What becomes easier, faster, clearer, or more beautiful?",
      },
      {
        text: "The strongest product stories connect function to feeling.",
      },
      {
        text: "Use this scene to make the value obvious.",
      },
    ],
  },
  {
    id: "showcase-scene-8",
    title: "Differentiation",
    duration: 25,
    camera: {
      kind: "orbit",
      orbitStart: 13.570796326794897,
    },
    lines: [
      {
        text: "Make the difference easy to understand.",
      },
      {
        text: "Not everything needs to be louder.",
      },
      {
        text: "Sometimes one comparison is enough.",
      },
      {
        text: "Show what LUME does differently",
        flipWords: {
          target: "differently",
          words: ["differently", "cleaner", "smarter"],
          intervalMs: 1500,
          finalHoldMs: 1500,
        },
      },
      {
        text: "The contrast should feel immediate.",
      },
    ],
  },
  {
    id: "showcase-scene-9",
    title: "Momentum",
    duration: 25,
    camera: {
      kind: "orbit",
      orbitStart: 15.570796326794897,
    },
    lines: [
      {
        text: "Now move toward action.",
      },
      {
        text: "The visitor has seen the product, the context, and the proof.",
      },
      {
        text: "This is where the story narrows.",
      },
      {
        text: "One clear next step is stronger than five competing options.",
      },
      {
        text: "Keep the path simple.",
      },
      {
        text: "Make the product easy to remember.",
        highlights: ["easy to remember"],
      },
    ],
  },
  {
    id: "showcase-scene-10",
    title: "Statement",
    duration: 25,
    camera: {
      kind: "orbit",
      orbitStart: 17.5707963267949,
    },
    lines: [
      {
        text: "LUME is designed to feel precise, modern, and useful.",
        flipWords: {
          target: "precise",
          words: ["precise", "modern", "useful"],
          intervalMs: 1500,
          finalHoldMs: 1500,
        },
      },
      {
        text: "Every transition should support the product, not distract from it.",
      },
      {
        text: "Every visual should reveal something real.",
      },
      {
        text: "Every line should earn its place.",
      },
      {
        text: "The showcase ends by making the next step feel natural.",
      },
    ],
  },
  {
    id: "showcase-scene-11",
    title: "",
    label: "Scene 11",
    duration: 25,
    camera: {
      kind: "orbit",
      orbitStart: 19.5707963267949,
    },
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
  },
  {
    id: "showcase-scene-12",
    title: "Product",
    duration: 20,
    camera: {
      kind: "orbit",
      orbitStart: 21.5707963267949,
    },
    lines: [
      {
        text: "The final scene is ready for product details, pricing, or contact.",
      },
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
  "showcase-scene-4":
    "vehicle%20images/3D%20assets/blackredbull6.optimized.glb",
  "showcase-scene-5":
    "vehicle%20images/3D%20assets/blackredbull6.optimized.glb",
  "showcase-scene-6":
    "vehicle%20images/3D%20assets/blackredbull6.optimized.glb",
  "showcase-scene-7":
    "vehicle%20images/3D%20assets/blackredbull6.optimized.glb",
  "showcase-scene-8":
    "vehicle%20images/3D%20assets/blackredbull6.optimized.glb",
  "showcase-scene-9":
    "vehicle%20images/3D%20assets/blackredbull6.optimized.glb",
  "showcase-scene-10":
    "vehicle%20images/3D%20assets/blackredbull6.optimized.glb",
  "showcase-scene-11":
    "vehicle%20images/3D%20assets/blackredbull6.optimized.glb",
  "showcase-scene-12":
    "vehicle%20images/3D%20assets/blackredbull6.optimized.glb",
} as const;
