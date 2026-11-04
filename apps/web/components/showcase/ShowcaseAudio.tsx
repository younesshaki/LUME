"use client";
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { openCookiePreferences } from "@lume/blocks/react/CookieBanner";
import type { ShowcaseScene } from "./types";
import type { StoryStore } from "./story-store";
import {
  createShowcaseAudioController,
  type ShowcaseAudioController,
} from "./audio-controller";
import {
  audioPreferenceKey,
  readAudioPreference,
  writeAudioPreference,
} from "./audio-preference";

export default function ShowcaseAudio({
  store,
  scenes,
  tenant,
}: {
  store: StoryStore;
  scenes: ShowcaseScene[];
  tenant: string;
}) {
  const controller = useRef<ShowcaseAudioController | null>(null);
  const [ready, setReady] = useState(false);
  const audio = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().audio,
    () => store.getSnapshot().audio,
  );
  const consent = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().consent,
    () => store.getSnapshot().consent,
  );
  useLayoutEffect(() => {
    const player = createShowcaseAudioController({
      store,
      scenes,
      preference: readAudioPreference(tenant),
      persist: (value) => writeAudioPreference(tenant, value),
    });
    controller.current = player;
    const visibility = () => player.visibility(document.hidden);
    const hide = () => player.visibility(true);
    const storage = (event: StorageEvent) => {
      if (event.key === null || event.key === audioPreferenceKey(tenant))
        player.preference(readAudioPreference(tenant));
    };
    visibility();
    setReady(true);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", visibility);
    window.addEventListener("storage", storage);
    return () => {
      controller.current = null;
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", visibility);
      window.removeEventListener("storage", storage);
      player.dispose();
    };
  }, [store, scenes, tenant]);
  const text =
    audio.status === "playing"
      ? "Audio on"
      : audio.status === "starting"
        ? "Starting audio…"
        : audio.status === "blocked"
          ? "Playback blocked. Tap Unmute audio to retry."
          : audio.status === "unavailable"
            ? "Audio could not load. Tap Unmute audio to retry."
            : consent !== "accepted"
              ? "Audio needs consent. Open Audio consent first."
              : audio.reason === "reduced-motion"
                ? "Reduced motion starts audio off. You can unmute."
                : "Audio off. Tap Unmute audio to listen.";
  const configured = scenes.some((scene) => scene.audio.url !== null);
  return (
    <div className="showcase__audio" aria-label="Showcase audio">
      <button
        type="button"
        className="showcase__button"
        disabled={!ready || !configured}
        aria-pressed={audio.enabled}
        aria-busy={audio.status === "starting"}
        onClick={(event) =>
          controller.current?.toggle(
            event.nativeEvent.isTrusted &&
              (navigator.userActivation?.isActive ?? true),
          )
        }
      >
        {audio.enabled ? "Mute audio" : "Unmute audio"}
      </button>
      <button
        type="button"
        className="showcase__button"
        onClick={openCookiePreferences}
      >
        Audio consent
      </button>
      <span role="status" aria-live="polite">
        {configured ? text : "Audio is not configured."}
      </span>
    </div>
  );
}
