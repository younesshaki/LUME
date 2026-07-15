import { useEffect, useRef } from "react";
import gsap from "gsap";
import { isUnlocked } from "@/lib/sound/audioEngine";

// The former R2 URL was never uploaded and produced a 404/CORS retry. This
// bundled same-origin asset is deliberately created only after user activation.
const OUTSIDE_SHOWCASE_MUSIC_URL =
  "/sounds/showcase/462089__newagesoup__ethereal-woosh.wav";

const TARGET_VOLUME = 0.2;
const FADE_IN_S = 4.5;
const FADE_OUT_S = 2.8;

export function OutsideShowcaseMusic({ enabled }: { enabled: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    const onPlaying = () => {
      const audio = audioRef.current;
      if (!audio || !enabledRef.current) return;
      gsap.killTweensOf(audio);
      gsap.to(audio, {
        volume: TARGET_VOLUME,
        duration: FADE_IN_S,
        ease: "power2.out",
      });
    };

    const ensureAudio = (): HTMLAudioElement => {
      if (audioRef.current) return audioRef.current;
      const audio = new Audio(OUTSIDE_SHOWCASE_MUSIC_URL);
      audio.loop = true;
      audio.preload = "none";
      audio.volume = 0;
      audio.addEventListener("playing", onPlaying);
      audioRef.current = audio;
      return audio;
    };

    const tryPlay = () => {
      if (!enabledRef.current) return;
      const audio = ensureAudio();
      if (audio.paused) void audio.play().catch(() => undefined);
    };

    // Pointer/keyboard activation keeps autoplay behavior deterministic. If
    // the global sound unlock already observed the gate/navigation gesture,
    // starting here is also user-activated rather than an app-start preload.
    window.addEventListener("pointerdown", tryPlay, { passive: true });
    window.addEventListener("keydown", tryPlay);
    if (isUnlocked()) tryPlay();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && audioRef.current) tryPlay();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("pointerdown", tryPlay);
      window.removeEventListener("keydown", tryPlay);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      const audio = audioRef.current;
      if (!audio) return;
      audio.removeEventListener("playing", onPlaying);
      gsap.killTweensOf(audio);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (enabled) {
      void audio.play().catch(() => undefined);
      return;
    }
    gsap.killTweensOf(audio);
    gsap.to(audio, {
      volume: 0,
      duration: FADE_OUT_S,
      ease: "power2.in",
      onComplete: () => audio.pause(),
    });
  }, [enabled]);

  return null;
}
