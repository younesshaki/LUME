import type { RefObject } from "react";
import { useEffect, useState } from "react";
import { useCinematicTimeline } from "../shared/useCinematicTimeline";
import { showcaseScrollGate } from "./showcaseScrollGate";

type ShowcaseTimelineOptions = {
  overlayRef: RefObject<HTMLDivElement>;
  isActive: boolean;
  onAllScenesComplete?: () => void;
};

const showcaseAdvanceGate = {
  isOpen: () => showcaseScrollGate.paragraphComplete,
  reset: () => showcaseScrollGate.reset(),
};

// Breathing room before any text appears: video plays in silence first.
const CHAPTER_START_DELAY_MS = 5000;

export function useShowcaseTimeline({
  overlayRef,
  isActive,
  onAllScenesComplete,
}: ShowcaseTimelineOptions) {
  const [timelineActive, setTimelineActive] = useState(false);

  useEffect(() => {
    if (!isActive) {
      setTimelineActive(false);
      return;
    }
    const timer = window.setTimeout(() => setTimelineActive(true), CHAPTER_START_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [isActive]);

  useCinematicTimeline({
    overlayRef,
    isActive: timelineActive,
    sceneDuration: 25,
    introDelay: 3,
    onAllScenesComplete,
    advanceGate: showcaseAdvanceGate,
  });
}
