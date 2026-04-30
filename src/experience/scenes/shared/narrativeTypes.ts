export type NarrativeLine = {
  text: string;
  className?: string;
  /** Substrings to wrap in animated gradient text */
  highlights?: string[];
  /** Replaces one word with an inline word cycle and extends the line hold time. */
  flipWords?: {
    target: string;
    words: string[];
    intervalMs?: number;
    startDelayMs?: number;
    finalHoldMs?: number;
  };
  /** Blank screen time before this line appears, used for syncing text to visual beats. */
  blankBeforeMs?: number;
  /** Seconds into the VO when this line should appear. If omitted, uses auto-calculated timing. */
  startTime?: number;
  /** Seconds into the VO when this line should disappear. If omitted, stays until scene ends. */
  endTime?: number;
};

type NarrativeSceneBase = {
  id: string;
  title: string;
  voiceOver?: string | null;
  voiceOverStartOffset?: number;
  voiceOverEndOffset?: number;
  // standard = scroll-based. cinematic = auto-play, no scroll.
  behavior?: "standard" | "cinematic";
  // duration in seconds for cinematic scenes
  duration?: number;
  mode?: "2d" | "3d";
  position?: {
    x: number;
    y: number;
    align?: "left" | "center" | "right";
  };
};

type NarrativeSceneSingle = NarrativeSceneBase & {
  lines: NarrativeLine[];
  columns?: never;
  mergeLines?: never;
};

type NarrativeSceneColumns = NarrativeSceneBase & {
  columns: {
    left: NarrativeLine[];
    right: NarrativeLine[];
  };
  mergeLines: NarrativeLine[];
  lines?: never;
};

export type NarrativeScene = NarrativeSceneSingle | NarrativeSceneColumns;
