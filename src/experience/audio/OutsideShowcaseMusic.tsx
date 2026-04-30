import { useEffect, useRef } from "react";
import gsap from "gsap";
import { mediaUrl, toFallbackUrl } from "@/config/cdn";

const OUTSIDE_SHOWCASE_MUSIC_URL = mediaUrl(
  "audio/showcase-ambient-loop.mp3"
);

const TARGET_VOLUME = 0.2;
const FADE_IN_S = 4.5;
const FADE_OUT_S = 2.8;
const WATCHDOG_INTERVAL_MS = 800;

export function OutsideShowcaseMusic({ enabled }: { enabled: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intentionalPauseRef = useRef(false);
  const startedOnceRef = useRef(false);
  const enabledRef = useRef(enabled);

  // Keep a ref of the latest `enabled` so the persistent watchdog & event handlers see fresh values
  enabledRef.current = enabled;

  useEffect(() => {
    const audio = new Audio(OUTSIDE_SHOWCASE_MUSIC_URL);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0;
    audio.crossOrigin = "anonymous";
    audioRef.current = audio;

    audio.onerror = () => {
      const fallback = toFallbackUrl(audio.src);
      if (audio.src !== fallback) {
        if (import.meta.env.DEV) {
          console.warn("[CDN fallback] R2 audio failed → Supabase: OutsideShowcaseMusic");
        }
        audio.src = fallback;
        void audio.play().catch(() => {});
      }
    };

    const tryPlay = () => {
      if (!enabledRef.current || !audioRef.current) return;
      if (!audioRef.current.paused) return;
      void audioRef.current.play().catch(() => {});
    };

    // Three event types — different browsers and input methods fire different ones.
    // Persistent (no { once: true }) so every gesture retries until success.
    window.addEventListener("pointerdown", tryPlay, { passive: true });
    window.addEventListener("click", tryPlay, { passive: true });
    window.addEventListener("keydown", tryPlay);
    window.addEventListener("touchstart", tryPlay, { passive: true });

    // If the tab returns to focus, retry
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") tryPlay();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Watchdog: every 800ms, if we should be playing but the audio is paused, retry.
    // This catches cases where the browser silently pauses us, where play() rejects async,
    // or where data wasn't ready on the first user gesture.
    const watchdogId = window.setInterval(() => {
      if (!enabledRef.current) return;
      if (intentionalPauseRef.current) return;
      if (!startedOnceRef.current) return; // wait for at least one successful start
      if (audio.paused) {
        void audio.play().catch(() => {});
      }
    }, WATCHDOG_INTERVAL_MS);

    // Mark "started once" the moment playback actually begins, so the watchdog kicks in
    const onPlaying = () => {
      startedOnceRef.current = true;
      if (intentionalPauseRef.current) return;
      // If we're below target volume and haven't been told to fade out, ensure fade-in happens
      if (audio.volume < TARGET_VOLUME * 0.99) {
        gsap.killTweensOf(audio);
        gsap.to(audio, {
          volume: TARGET_VOLUME,
          duration: FADE_IN_S,
          ease: "power2.out",
        });
      }
    };
    audio.addEventListener("playing", onPlaying);

    return () => {
      window.removeEventListener("pointerdown", tryPlay);
      window.removeEventListener("click", tryPlay);
      window.removeEventListener("keydown", tryPlay);
      window.removeEventListener("touchstart", tryPlay);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(watchdogId);
      audio.removeEventListener("playing", onPlaying);
      gsap.killTweensOf(audio);
      intentionalPauseRef.current = true;
      audio.pause();
      audio.src = "";
      audioRef.current = null;
      startedOnceRef.current = false;
    };
  }, []);

  // React to enabled toggling
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (enabled) {
      intentionalPauseRef.current = false;
      // Try immediately — works if a user gesture has already happened on the page
      void audio.play().catch(() => {});
      // The watchdog + gesture listeners will handle retries.
      return;
    }

    // Disabled — deliberate fade-out
    intentionalPauseRef.current = true;
    gsap.killTweensOf(audio);
    gsap.to(audio, {
      volume: 0,
      duration: FADE_OUT_S,
      ease: "power2.in",
      onComplete: () => {
        audio.pause();
      },
    });
  }, [enabled]);

  return null;
}
