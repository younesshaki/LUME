export type ShowcaseKind = "landing" | "intro" | "experience";
export type SceneId =
  | "showcase-scene-1"
  | "showcase-scene-2"
  | "showcase-scene-3"
  | "showcase-scene-4"
  | "showcase-scene-5"
  | "showcase-scene-6"
  | "showcase-scene-7"
  | "showcase-scene-8"
  | "showcase-scene-9"
  | "showcase-scene-10"
  | "showcase-scene-11"
  | "showcase-scene-12";
export type StoryLine = {
  text: string;
  blankBeforeMs?: number;
  highlights?: string[];
  flipWords?: {
    target: string;
    words: string[];
    intervalMs: number;
    finalHoldMs: number;
  };
};
export type ShowcaseScene = {
  id: SceneId;
  title: string;
  /** Accessible navigation label when the source intentionally has no title. */
  label?: string;
  duration: number;
  modelUrl: string | null;
  lines: StoryLine[];
  camera: { kind: "crane" | "orbit"; orbitStart: number };
};
export type ShowcaseAssets = { scenes: ShowcaseScene[] };
export type ShowcaseEntry = { part: 6; chapter: 0 };
export type ShowcaseProps = {
  tenant: string;
  assets: ShowcaseAssets;
  entry: ShowcaseEntry;
};
