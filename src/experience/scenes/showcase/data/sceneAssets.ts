import { mediaUrl } from "@/config/cdn";

export type ShowcaseVideoQuality = "high" | "normal";

export const showcaseSceneAssets = {
  models: {
    heroProduct: mediaUrl("models/hero-product.glb"),
    materialStudy: mediaUrl("models/material-study.glb"),
    detailObject: mediaUrl("models/product-detail.glb"),
  },
  audio: {},
  video: {
    background:   mediaUrl("video/showcase-background.mp4"),
    blenderScenes: {
      high: [
        mediaUrl("premiumredbull4Khandbrake3.mp4"),
        mediaUrl("video/showcase-scene-2-high.mp4"),
        mediaUrl("video/showcase-scene-3-high.mp4"),
        mediaUrl("video/showcase-scene-4-high.mp4"),
        mediaUrl("video/showcase-scene-final-high.mp4"),
      ],
      normal: [
        mediaUrl("premiumredbull4Khandbrake3.mp4"),
        mediaUrl("video/showcase-scene-2-normal.mp4"),
        mediaUrl("video/showcase-scene-3-normal.mp4"),
        mediaUrl("video/showcase-scene-4-normal.mp4"),
        mediaUrl("video/showcase-scene-final-normal.mp4"),
      ],
    } satisfies Record<ShowcaseVideoQuality, string[]>,
  },
};

// Models are not needed until scene 12 — preloaded lazily inside ShowcaseChapter on mount,
// so they don't block the preloader gate.
export const chapterModelUrls: string[] = [];
