import { useEffect, useRef } from "react";
import {
  showcaseSceneAssets,
  type ShowcaseVideoQuality,
} from "./data/sceneAssets";
import { getShowcaseVideoSource } from "./videoPreloadCache";

type BackgroundVideoProps = {
  isVisible?: boolean;
  activeSceneIndex?: number;
  shouldPlay?: boolean;
  quality?: ShowcaseVideoQuality;
};

// Which video index to show per scene (0-indexed, 10 scenes total)
// video 0 → scenes 0-1  video 1 → scenes 2-3  video 2 → scenes 4-6
// video 3 → scenes 7-8  video 4 → scenes 9-10 (blenderscenefinal)
const SCENE_TO_VIDEO: number[] = [0, 0, 1, 1, 2, 2, 2, 3, 3, 4, 4];

// Pause points: pause the video when it reaches `atSeconds` during `sceneIndex`.
// Playback resumes when activeSceneIndex advances past sceneIndex.
type PausePoint = { videoIndex: number; atSeconds: number; sceneIndex: number };
const PAUSE_POINTS: PausePoint[] = [
  { videoIndex: 2, atSeconds: 23.5, sceneIndex: 4 }, // blenderscene3 – end of scene 5
  { videoIndex: 2, atSeconds: 35,   sceneIndex: 5 }, // blenderscene3 – end of scene 6
  { videoIndex: 3, atSeconds: 11,   sceneIndex: 7 }, // blenderscene5  – end of scene 8
  { videoIndex: 4, atSeconds: 17,   sceneIndex: 9 }, // blenderscenefinal – end of scene 10
];

// Duration of the blur overlay that hides the swap (ms).
// We do NOT fade to white — the back-buffer approach keeps the old frame
// visible behind the blur until the new video has a frame ready.
const BLUR_DURATION_MS = 380;
const BLUR_PEAK_PX = 14;
const INTRO_VIDEO_FADE_MS = 5200;

const videoSource = (quality: ShowcaseVideoQuality, index: number) =>
  getShowcaseVideoSource(showcaseSceneAssets.video.blenderScenes[quality][index]);

export function BackgroundVideo({
  isVisible = true,
  activeSceneIndex = 0,
  shouldPlay = true,
  quality = "high",
}: BackgroundVideoProps) {
  // Two video elements; we alternate which one is "active" (opacity 1)
  const videoARef = useRef<HTMLVideoElement | null>(null);
  const videoBRef = useRef<HTMLVideoElement | null>(null);
  // Third hidden element used only for lookahead prefetching
  const preloadVideoRef = useRef<HTMLVideoElement | null>(null);
  const preloadedIndexRef = useRef(-1);

  // 0 = A is active, 1 = B is active
  const activeSlotRef = useRef<0 | 1>(0);
  const currentVideoIndexRef = useRef(-1);
  const activeSceneIndexRef = useRef(activeSceneIndex);
  const pausedAtPointRef = useRef<PausePoint | null>(null);
  const transitionInProgressRef = useRef(false);
  const shouldPlayRef = useRef(shouldPlay);
  const introFadeDoneRef = useRef(false);

  // Keep a live ref to activeSceneIndex for timeupdate callback
  useEffect(() => {
    activeSceneIndexRef.current = activeSceneIndex;
  }, [activeSceneIndex]);

  useEffect(() => {
    shouldPlayRef.current = shouldPlay;
    const slots = [videoARef.current, videoBRef.current] as const;
    const active = slots[activeSlotRef.current];

    if (!active) return;

    if (shouldPlay) {
      const revealIntroVideo = () => {
        if (introFadeDoneRef.current) return;
        introFadeDoneRef.current = true;
        active.style.transition = `opacity ${INTRO_VIDEO_FADE_MS}ms ease`;
        active.style.opacity = "1";
      };

      if (!introFadeDoneRef.current) {
        if (active.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          window.setTimeout(revealIntroVideo, 160);
        } else {
          active.addEventListener("loadeddata", revealIntroVideo, { once: true });
          active.addEventListener("canplay", revealIntroVideo, { once: true });
        }
      }

      void active.play().catch(() => {});

      return () => {
        active.removeEventListener("loadeddata", revealIntroVideo);
        active.removeEventListener("canplay", revealIntroVideo);
      };
    }

    slots.forEach((video) => video?.pause());
  }, [shouldPlay]);

  // ── Lookahead preload — fetch the next video 2 scenes early ───────────────
  useEffect(() => {
    const pv = preloadVideoRef.current;
    if (!pv) return;

    const curVideoIdx = SCENE_TO_VIDEO[Math.min(activeSceneIndex, 10)] ?? 0;
    const lookAheadScene = Math.min(activeSceneIndex + 2, 10);
    const nextVideoIdx = SCENE_TO_VIDEO[lookAheadScene] ?? curVideoIdx;

    if (nextVideoIdx === curVideoIdx || nextVideoIdx === preloadedIndexRef.current) return;

    preloadedIndexRef.current = nextVideoIdx;
    pv.src = videoSource(quality, nextVideoIdx);
    pv.load();
  }, [activeSceneIndex, quality]);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    const front = videoARef.current;
    const back  = videoBRef.current;
    if (!front || !back) return;

    // A starts hidden over black. It fades in only when the chapter is revealed.
    front.style.opacity = "0";
    back.style.opacity  = "0";

    front.src = videoSource(quality, 0);
    front.currentTime = 0;
    currentVideoIndexRef.current = 0;
    if (shouldPlayRef.current) {
      void front.play().catch(() => {});
    } else {
      front.load();
    }
  }, [quality]);

  // ── timeupdate — enforce pause points ────────────────────────────────────
  useEffect(() => {
    const handleTimeUpdate = (video: HTMLVideoElement) => () => {
      if (pausedAtPointRef.current) return;
      const videoIndex = currentVideoIndexRef.current;
      const sceneIdx   = activeSceneIndexRef.current;
      const t          = video.currentTime;

      const hit = PAUSE_POINTS.find(
        (p) =>
          p.videoIndex === videoIndex &&
          p.sceneIndex === sceneIdx &&
          t >= p.atSeconds
      );

      if (hit) {
        video.pause();
        // Snap slightly before the mark so resume is seamless
        video.currentTime = Math.max(0, hit.atSeconds - 0.04);
        pausedAtPointRef.current = hit;
      }
    };

    const a = videoARef.current;
    const b = videoBRef.current;
    if (!a || !b) return;

    const handlerA = handleTimeUpdate(a);
    const handlerB = handleTimeUpdate(b);
    a.addEventListener("timeupdate", handlerA);
    b.addEventListener("timeupdate", handlerB);
    return () => {
      a.removeEventListener("timeupdate", handlerA);
      b.removeEventListener("timeupdate", handlerB);
    };
  }, []);

  // ── Scene change ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeSceneIndex < 0) return;
    const nextVideoIndex = SCENE_TO_VIDEO[Math.min(activeSceneIndex, 10)] ?? 0;
    const slots = [videoARef.current, videoBRef.current] as const;
    const frontSlot = activeSlotRef.current;
    const backSlot  = (frontSlot === 0 ? 1 : 0) as 0 | 1;
    const front = slots[frontSlot];
    const back  = slots[backSlot];
    if (!front || !back) return;

    // ── Same video: just resume if we were paused at this scene's gate ──────
    if (nextVideoIndex === currentVideoIndexRef.current) {
      const paused = pausedAtPointRef.current;
      if (paused && activeSceneIndex > paused.sceneIndex) {
        pausedAtPointRef.current = null;
        if (shouldPlayRef.current) {
          void front.play().catch(() => {});
        }
      }
      return;
    }

    // ── Different video: double-buffer crossfade ───────────────────────────
    if (transitionInProgressRef.current) return;
    transitionInProgressRef.current = true;
    pausedAtPointRef.current = null;

    // Step 1 — blur the front video
    front.style.transition = `filter ${BLUR_DURATION_MS}ms ease-out`;
    front.style.filter     = `blur(${BLUR_PEAK_PX}px)`;

    // Load the new video into the back buffer while the blur peaks
    back.src = videoSource(quality, nextVideoIndex);
    back.style.opacity    = "0";
    back.style.filter     = "blur(0px)";
    back.style.transition = "none";

    const onCanPlay = () => {
      back.removeEventListener("canplay", onCanPlay);
      if (shouldPlayRef.current) {
        void back.play().catch(() => {});
      }

      // Step 2 — once back has a frame, crossfade: unblur front, bring back to opacity 1
      // We use a slight delay so the blur peak is visible for a beat
      const crossfadeTimer = window.setTimeout(() => {
        // Swap which slot is considered "active"
        activeSlotRef.current = backSlot;
        currentVideoIndexRef.current = nextVideoIndex;
        transitionInProgressRef.current = false;

        // Bring back into view without a brightness flash
        back.style.transition  = `opacity ${BLUR_DURATION_MS}ms ease-in`;
        back.style.opacity     = "1";

        // Fade out old front
        front.style.transition = `filter ${BLUR_DURATION_MS}ms ease-in, opacity ${BLUR_DURATION_MS}ms ease-in`;
        front.style.filter     = "blur(0px)";
        front.style.opacity    = "0";

        // Pause old front once hidden
        window.setTimeout(() => {
          front.pause();
          front.removeAttribute("src");
        }, BLUR_DURATION_MS + 50);
      }, BLUR_DURATION_MS);

      return () => window.clearTimeout(crossfadeTimer);
    };

    back.addEventListener("canplay", onCanPlay);

    // Fallback: if canplay never fires within reasonable time, still swap
    const fallback = window.setTimeout(() => {
      back.removeEventListener("canplay", onCanPlay);
      activeSlotRef.current = backSlot;
      currentVideoIndexRef.current = nextVideoIndex;
      transitionInProgressRef.current = false;
      back.style.opacity    = "1";
      front.style.opacity   = "0";
      front.style.filter    = "blur(0px)";
      if (shouldPlayRef.current) {
        void back.play().catch(() => {});
      }
    }, BLUR_DURATION_MS * 4);

    return () => {
      window.clearTimeout(fallback);
      back.removeEventListener("canplay", onCanPlay);
    };
  }, [activeSceneIndex, quality]);

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        overflow: "hidden",
        pointerEvents: "none",
        opacity: isVisible ? 1 : 0,
        transition: "opacity 500ms ease",
        background: "#000000",
      }}
    >
      {/* Two video layers — only one visible at a time */}
      <video
        ref={videoARef}
        muted
        playsInline
        preload="auto"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: 0,
          filter: "blur(0px)",
        }}
      />
      <video
        ref={videoBRef}
        muted
        playsInline
        preload="auto"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: 0,
          filter: "blur(0px)",
        }}
      />
      {/* Hidden lookahead buffer — fetches the next video before the transition */}
      <video
        ref={preloadVideoRef}
        muted
        playsInline
        preload="auto"
        style={{ display: "none" }}
      />
    </div>
  );
}
