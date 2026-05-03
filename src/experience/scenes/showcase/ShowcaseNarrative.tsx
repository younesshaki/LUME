import type { RefObject } from "react";
import { NarrativeOverlay } from "../shared/NarrativeOverlay";
import type { NarrativeScene } from "../shared/narrativeTypes";
import "./Showcase.css";

type ShowcaseNarrativeProps = {
  isActive: boolean;
  overlayRef: RefObject<HTMLDivElement>;
  scenes: NarrativeScene[];
};

export function ShowcaseNarrative({
  isActive,
  overlayRef,
  scenes,
}: ShowcaseNarrativeProps) {
  return (
    <NarrativeOverlay
      isActive={isActive}
      overlayRef={overlayRef}
      scenes={scenes}
      overlayClassName="showcaseOverlay"
      sceneClassName="showcaseScene"
      titleClassName="showcaseTitle"
      lineClassName="showcaseLine"
    />
  );
}
