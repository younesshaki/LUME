import { memo, useEffect, useRef } from "react";
import { Loader as LoaderA, loaderAudio as loaderAudioA } from "../loader-a";
import { Loader as LoaderB, loaderAudio as loaderAudioB } from "../loader-b";
import { Loader as LoaderC, loaderAudio as loaderAudioC } from "../loader-c";
import { Loader as LoaderD, loaderAudio as loaderAudioD } from "../loader-d";
import { Loader as LoaderE, loaderAudio as loaderAudioE } from "../loader-e";
import { Loader as LoaderF, loaderAudio as loaderAudioF } from "../loader-f";
import { Loader as LoaderPre, loaderAudio as loaderAudioPre } from "../preloader";
import type { LoaderAudio, LoaderComponent, LoaderVariant } from "./types";
import { useSoundSettings } from "../../soundContext";
import "./LoaderOverlay.css";

type LoaderOverlayProps = {
  visible: boolean;
  variant: LoaderVariant;
  text: string;
};

const loaderRegistry: Record<
  LoaderVariant,
  { Component: LoaderComponent; audio: LoaderAudio | null }
> = {
  pre: { Component: LoaderPre, audio: loaderAudioPre },
  a: { Component: LoaderA, audio: loaderAudioA },
  b: { Component: LoaderB, audio: loaderAudioB },
  c: { Component: LoaderC, audio: loaderAudioC },
  d: { Component: LoaderD, audio: loaderAudioD },
  e: { Component: LoaderE, audio: loaderAudioE },
  f: { Component: LoaderF, audio: loaderAudioF },
};

export const LoaderOverlay = memo(({ visible, variant, text }: LoaderOverlayProps) => {
  const { soundEnabled, soundBlocked } = useSoundSettings();
  const audioRef = useRef<{ loop?: HTMLAudioElement; sfx?: HTMLAudioElement } | null>(null);
  const { Component, audio } = loaderRegistry[variant];

  useEffect(() => {
    const canPlay = visible && audio && soundEnabled && !soundBlocked;
    if (!canPlay) {
      const fadeOutMs = audio?.fadeOutMs ?? 0;
      const stopAudio = (element?: HTMLAudioElement) => {
        if (!element) return;

        if (fadeOutMs > 0 && element.volume > 0) {
          const startVolume = element.volume;
          const startTime = performance.now();

          const tick = (now: number) => {
            const progress = Math.min((now - startTime) / fadeOutMs, 1);
            element.volume = startVolume * (1 - progress);

            if (progress < 1) {
              window.requestAnimationFrame(tick);
              return;
            }

            element.pause();
            element.currentTime = 0;
            element.volume = startVolume;
          };

          window.requestAnimationFrame(tick);
          return;
        }

        element.pause();
        element.currentTime = 0;
      };

      stopAudio(audioRef.current?.loop);
      stopAudio(audioRef.current?.sfx);
      audioRef.current = null;
      return;
    }

    const loopAudio = audio?.loop ? new Audio(audio.loop) : undefined;
    const sfxAudio = audio?.sfx ? new Audio(audio.sfx) : undefined;
    const volume = audio?.volume ?? 0.7;
    const fadeInMs = audio?.fadeInMs ?? 0;

    if (loopAudio) {
      loopAudio.loop = true;
      loopAudio.volume = fadeInMs > 0 ? 0 : volume;
      const playPromise = loopAudio.play();
      if (playPromise?.catch) {
        playPromise.catch(() => {});
      }

      if (fadeInMs > 0) {
        const startTime = performance.now();
        const tick = (now: number) => {
          const progress = Math.min((now - startTime) / fadeInMs, 1);
          loopAudio.volume = volume * progress;
          if (progress < 1) {
            window.requestAnimationFrame(tick);
          }
        };

        window.requestAnimationFrame(tick);
      }
    }

    if (sfxAudio) {
      sfxAudio.volume = volume;
      const playPromise = sfxAudio.play();
      if (playPromise?.catch) {
        playPromise.catch(() => {});
      }
    }

    audioRef.current = { loop: loopAudio, sfx: sfxAudio };

    return () => {
      if (loopAudio) {
        loopAudio.pause();
        loopAudio.currentTime = 0;
      }
      if (sfxAudio) {
        sfxAudio.pause();
        sfxAudio.currentTime = 0;
      }
      audioRef.current = null;
    };
  }, [audio, soundBlocked, soundEnabled, variant, visible]);

  return (
    <>
      <div
        className={`loaderBackdropOverlay loaderBackdrop loaderBackdrop-${variant} ${
          !visible ? "hidden" : ""
        }`}
      />

      <div className={`loaderContainerOverlay ${!visible ? "hidden" : ""}`}>
        <Component text={text} />
      </div>
    </>
  );
});

LoaderOverlay.displayName = "LoaderOverlay";
