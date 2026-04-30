import type { RefObject } from "react";
import { NarrativeOverlay } from "../shared/NarrativeOverlay";
import { showcaseScenes } from "./data";
import "./Showcase.css";

type ShowcaseNarrativeProps = {
  isActive: boolean;
  overlayRef: RefObject<HTMLDivElement>;
};

export function ShowcaseNarrative({
  isActive,
  overlayRef,
}: ShowcaseNarrativeProps) {
  return (
    <NarrativeOverlay
      isActive={isActive}
      overlayRef={overlayRef}
      scenes={showcaseScenes}
      overlayClassName="showcaseOverlay"
      sceneClassName="showcaseScene"
      titleClassName="showcaseTitle"
      lineClassName="showcaseLine"
    />
  );
}
