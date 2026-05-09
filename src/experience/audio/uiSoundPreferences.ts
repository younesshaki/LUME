const UI_SOUND_STORAGE_KEY = "lume.ui-sound-enabled.v1";
const UI_SOUND_EVENT = "lume:ui-sound-preference";

type UiSoundPreferenceEvent = CustomEvent<{ enabled: boolean }>;

export function readUiSoundPreference(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.localStorage?.getItem !== "function"
  ) {
    return true;
  }

  return window.localStorage.getItem(UI_SOUND_STORAGE_KEY) !== "false";
}

export function setUiSoundPreference(enabled: boolean): void {
  if (
    typeof window === "undefined" ||
    typeof window.localStorage?.setItem !== "function"
  ) {
    return;
  }

  window.localStorage.setItem(UI_SOUND_STORAGE_KEY, String(enabled));
  window.dispatchEvent(
    new CustomEvent<{ enabled: boolean }>(UI_SOUND_EVENT, {
      detail: { enabled },
    })
  );
}

export function subscribeToUiSoundPreference(
  listener: (enabled: boolean) => void
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const onPreferenceChange = (event: Event) => {
    listener((event as UiSoundPreferenceEvent).detail.enabled);
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key === UI_SOUND_STORAGE_KEY) {
      listener(readUiSoundPreference());
    }
  };

  window.addEventListener(UI_SOUND_EVENT, onPreferenceChange);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(UI_SOUND_EVENT, onPreferenceChange);
    window.removeEventListener("storage", onStorage);
  };
}
