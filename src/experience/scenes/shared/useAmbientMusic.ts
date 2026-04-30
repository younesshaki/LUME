import { useEffect, useRef } from "react";
import gsap from "gsap";
import { audioSyncRegistry } from "./audioSync";

const devLog = (...args: unknown[]) => {
  if (import.meta.env.DEV) {
    console.log(...args);
  }
};

const devWarn = (...args: unknown[]) => {
  if (import.meta.env.DEV) {
    console.warn(...args);
  }
};

type UseAmbientMusicOptions = {
  /** URL to the ambient music file */
  musicUrl: string | null;
  /** Whether the chapter is active */
  isActive: boolean;
  /** Volume when no VO is playing (0-1) */
  baseVolume?: number;
  /** Volume when VO is playing - ducked (0-1) */
  duckedVolume?: number;
  /** Fade in duration in seconds */
  fadeInDuration?: number;
  /** Fade out duration in seconds */
  fadeOutDuration?: number;
  /** Delay before music starts (seconds) */
  startDelay?: number;
};

/**
 * Hook for managing ambient background music that plays behind voiceovers.
 * Automatically ducks (lowers volume) when VO is playing.
 */
export function useAmbientMusic({
  musicUrl,
  isActive,
  baseVolume = 0.25,
  duckedVolume = 0.08,
  fadeInDuration = 2.5,
  fadeOutDuration = 1.5,
  startDelay = 1,
}: UseAmbientMusicOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isPlayingRef = useRef(false);
  const currentVolumeRef = useRef(0);
  const targetVolumeRef = useRef(baseVolume);

  useEffect(() => {
    if (!musicUrl) return;

    // Create audio element
    const audio = new Audio();
    audio.src = musicUrl;
    audio.loop = true;
    audio.volume = 0;
    audio.preload = "auto";
    audioRef.current = audio;

    devLog("[AmbientMusic] Audio element created");

    return () => {
      if (audioRef.current) {
        gsap.killTweensOf(audioRef.current);
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
    };
  }, [musicUrl]);

  // Handle chapter active state
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !musicUrl) return;

    if (isActive) {
      // Start playing with fade in after delay
      const startMusic = () => {
        if (!audioRef.current || isPlayingRef.current) return;

        devLog("[AmbientMusic] Starting ambient music");
        isPlayingRef.current = true;
        
        audioRef.current.currentTime = 0;
        audioRef.current.volume = 0;
        audioRef.current.play().catch((err) => {
          devWarn("[AmbientMusic] Autoplay blocked:", err);
          isPlayingRef.current = false;
        });

        // Fade in to base volume
        gsap.to(audioRef.current, {
          volume: baseVolume,
          duration: fadeInDuration,
          ease: "power2.out",
          onUpdate: () => {
            if (audioRef.current) {
              currentVolumeRef.current = audioRef.current.volume;
            }
          },
        });
      };

      const delayedCall = gsap.delayedCall(startDelay, startMusic);

      return () => {
        delayedCall.kill();
      };
    } else {
      // Fade out and stop
      if (audio && isPlayingRef.current) {
        devLog("[AmbientMusic] Fading out ambient music");
        gsap.to(audio, {
          volume: 0,
          duration: fadeOutDuration,
          ease: "power2.in",
          onComplete: () => {
            if (audioRef.current) {
              audioRef.current.pause();
              audioRef.current.currentTime = 0;
              isPlayingRef.current = false;
            }
          },
        });
      }
    }
  }, [isActive, musicUrl, baseVolume, fadeInDuration, fadeOutDuration, startDelay]);

  // Auto-duck when VO is playing
  useEffect(() => {
    if (!isActive || !musicUrl) return;

    const unsubscribe = audioSyncRegistry.subscribeToPlayingState((voIsPlaying) => {
      const audio = audioRef.current;
      if (!audio || !isPlayingRef.current) return;

      if (voIsPlaying) {
        // Duck the music when VO starts
        devLog("[AmbientMusic] Ducking for VO");
        gsap.to(audio, {
          volume: duckedVolume,
          duration: 0.8,
          ease: "power2.out",
        });
      } else {
        // Restore volume when VO ends
        devLog("[AmbientMusic] Restoring volume after VO");
        gsap.to(audio, {
          volume: baseVolume,
          duration: 1.2,
          ease: "power2.out",
        });
      }
    });

    return unsubscribe;
  }, [isActive, musicUrl, baseVolume, duckedVolume]);

  // Expose methods for manual ducking if needed
  const duck = () => {
    const audio = audioRef.current;
    if (!audio || !isPlayingRef.current) return;

    targetVolumeRef.current = duckedVolume;
    gsap.to(audio, {
      volume: duckedVolume,
      duration: 0.8,
      ease: "power2.out",
    });
  };

  const unduck = () => {
    const audio = audioRef.current;
    if (!audio || !isPlayingRef.current) return;

    targetVolumeRef.current = baseVolume;
    gsap.to(audio, {
      volume: baseVolume,
      duration: 1.2,
      ease: "power2.out",
    });
  };

  return {
    duck,
    unduck,
    audioRef,
  };
}
