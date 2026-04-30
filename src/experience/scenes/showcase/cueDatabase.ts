import type { NarrativeLine } from "../shared/narrativeTypes";
import { showcaseScenes } from "./data";

export type TextCue = {
  lineIndex: number;
  text: string;
  startTime: number;
  endTime: number;
};

export type SceneCueData = {
  sceneId: string;
  voDuration: number;
  allLines: NarrativeLine[];
  textCues: TextCue[];
  imageCues: [];
  videoCues: [];
};

function textCuesFromLines(lines: NarrativeLine[]): TextCue[] {
  return lines
    .map((line, index) => {
      if (line.startTime === undefined) {
        return null;
      }

      return {
        lineIndex: index,
        text: line.text,
        startTime: line.startTime,
        endTime: line.endTime ?? line.startTime + 3,
      };
    })
    .filter((cue): cue is TextCue => cue !== null);
}

export const SHOWCASE_CUES: Record<string, SceneCueData> = Object.fromEntries(
  showcaseScenes.map((scene) => {
    const allLines = "lines" in scene && scene.lines ? scene.lines : [];

    return [
      scene.id,
      {
        sceneId: scene.id,
        voDuration: scene.duration ?? 25,
        allLines,
        textCues: textCuesFromLines(allLines),
        imageCues: [],
        videoCues: [],
      },
    ];
  })
);
