"use client";
import type { ShowcaseScene, StoryLine } from "./types";
import { useStory } from "./StoryBridge";

import { narrativeAt } from "./story-cues";
function ReadableLine({ line }: { line: StoryLine }) {
  return <p>{line.text}</p>;
}
export default function StoryNarrative({ scene }: { scene: ShowcaseScene }) {
  const state = useStory();
  return (
    <div
      className="showcase__story"
      data-scene={scene.id}
      data-progress={state.sceneProgress.toFixed(3)}
    >
      <h2>{scene.title}</h2>
      {state.reduced ? (
        scene.lines.map((line) => <ReadableLine key={line.text} line={line} />)
      ) : (
        <p className="showcase__cue">
          {narrativeAt(scene, state.sceneProgress) || "\u00a0"}
        </p>
      )}
      <span className="showcase__bridge-status">
        Audio unavailable in this preview · consent{" "}
        {state.consent ?? "undecided"}
      </span>
    </div>
  );
}
