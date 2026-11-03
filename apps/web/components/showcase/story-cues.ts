"use client";
import type { ShowcaseScene } from "./types";

/** Keep authored pauses/flip cues as relative scroll weights. There is no
 * autoplay clock: scrolling backwards deterministically reverses the story.
 */
export function narrativeAt(scene: ShowcaseScene, progress: number) {
  const weights = scene.lines.map(
    (line) =>
      (line.blankBeforeMs ?? 0) +
      (line.flipWords
        ? line.flipWords.words.length * line.flipWords.intervalMs +
          line.flipWords.finalHoldMs
        : 2500),
  );
  let time = progress * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < scene.lines.length; i++) {
    if (time < weights[i] || i === scene.lines.length - 1) {
      const line = scene.lines[i];
      if (time < (line.blankBeforeMs ?? 0)) return "";
      const flip = line.flipWords;
      return flip
        ? line.text.replace(
            flip.target,
            flip.words[
              Math.min(
                flip.words.length - 1,
                Math.floor(
                  (time - (line.blankBeforeMs ?? 0)) / flip.intervalMs,
                ),
              )
            ],
          )
        : line.text;
    }
    time -= weights[i];
  }
  return "";
}
