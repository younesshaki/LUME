import { useEffect, useRef } from "react";
import gsap from "gsap";
import {
  showcaseProductChoiceMusicUrl,
  showcaseScene1To4MusicUrl,
  showcaseScene5To8MusicUrl,
  showcaseScene9To11MusicUrl,
} from "./audio";

// Scene index → which track (0-indexed)
// scenes 0-3  → track 0
// scenes 4-7  → track 1
// scenes 8-10 → track 2
// productChoice + scene 12 → track 3
function trackForScene(sceneIndex: number, useProductChoiceMusic: boolean): number {
  if (useProductChoiceMusic) return 3;
  if (sceneIndex <= 3) return 0;
  if (sceneIndex <= 7) return 1;
  return 2;
}

const TRACK_URLS = [
  showcaseScene1To4MusicUrl,
  showcaseScene5To8MusicUrl,
  showcaseScene9To11MusicUrl,
  showcaseProductChoiceMusicUrl,
];

const BASE_VOLUME   = 0.28;
const FADE_IN_S     = 5.0;   // long cinematic entry
const FADE_OUT_S    = 3.5;   // slow, emotional fade out
const CROSSFADE_S   = 3.5;   // smooth track crossfade
const START_DELAY_S = 1.2;   // slight breath before music begins

export function useShowcaseSceneMusic(
  activeSceneIndex: number,
  isActive: boolean,
  useProductChoiceMusic = false
) {
  const audiosRef   = useRef<(HTMLAudioElement | null)[]>([null, null, null, null]);
  const activeTrack = useRef(-1);

  // Create all three audio elements once
  useEffect(() => {
    const audios = TRACK_URLS.map((url) => {
      if (!url) return null;
      const a = new Audio(url);
      a.loop    = true;
      a.volume  = 0;
      a.preload = "auto";
      return a;
    });
    audiosRef.current = audios;

    return () => {
      audios.forEach((a) => {
        if (!a) return;
        gsap.killTweensOf(a);
        a.pause();
        a.src = "";
      });
      activeTrack.current = -1;
    };
  }, []);

  // Handle chapter active/inactive
  useEffect(() => {
    if (!isActive) {
      // Fade out whatever is playing
      audiosRef.current.forEach((a) => {
        if (!a || a.paused) return;
        gsap.to(a, {
          volume: 0,
          duration: FADE_OUT_S,
          ease: "power2.in",
          onComplete: () => { a.pause(); a.currentTime = 0; },
        });
      });
      activeTrack.current = -1;
    }
  }, [isActive]);

  // React to scene changes
  useEffect(() => {
    if (!isActive) return;

    const nextTrack = trackForScene(activeSceneIndex, useProductChoiceMusic);
    if (nextTrack === activeTrack.current) return;

    const prevTrack = activeTrack.current;
    activeTrack.current = nextTrack;

    const next = audiosRef.current[nextTrack];
    if (!next) return;

    // Fade out the previous track (if any)
    if (prevTrack >= 0) {
      const prev = audiosRef.current[prevTrack];
      if (prev && !prev.paused) {
        gsap.killTweensOf(prev);
        gsap.to(prev, {
          volume: 0,
          duration: CROSSFADE_S,
          ease: "power2.in",
          onComplete: () => { prev.pause(); prev.currentTime = 0; },
        });
      }
    }

    // Fade in the next track
    gsap.killTweensOf(next);
    next.currentTime = 0;
    next.volume      = 0;

    const startAndFade = () => {
      next.play().catch(() => {});
      gsap.to(next, {
        volume: BASE_VOLUME,
        duration: FADE_IN_S,
        ease: "power2.out",
      });
    };

    if (prevTrack < 0) {
      // Very first track — honour the start delay
      const id = window.setTimeout(startAndFade, START_DELAY_S * 1000);
      return () => window.clearTimeout(id);
    } else {
      // Crossfade: start immediately so it overlaps with the fade-out
      startAndFade();
    }
  }, [activeSceneIndex, isActive, useProductChoiceMusic]);
}
