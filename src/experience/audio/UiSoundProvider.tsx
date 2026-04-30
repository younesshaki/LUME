import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { StoryContext } from "../story/StoryProvider";
import { UiSoundService } from "./uiSoundService";

const UiSoundContext = createContext<UiSoundService | null>(null);

export function UiSoundProvider({ children }: PropsWithChildren) {
  const story = useContext(StoryContext);
  const isReady = story?.isReady ?? false;
  const soundEnabled = story?.state.preferences.soundEnabled ?? true;
  const [service] = useState(() => new UiSoundService());

  useEffect(() => {
    service.setEnabled(isReady ? soundEnabled : true);
  }, [isReady, service, soundEnabled]);

  useEffect(() => {
    const prime = () => {
      service.prime();
    };

    window.addEventListener("pointerdown", prime, { passive: true });
    window.addEventListener("keydown", prime);

    return () => {
      window.removeEventListener("pointerdown", prime);
      window.removeEventListener("keydown", prime);
    };
  }, [service]);

  const contextValue = useMemo(() => service, [service]);

  return (
    <UiSoundContext.Provider value={contextValue}>
      {children}
    </UiSoundContext.Provider>
  );
}

export function useUiSoundService() {
  const service = useContext(UiSoundContext);
  if (!service) {
    throw new Error("useUiSoundService must be used within UiSoundProvider");
  }

  return service;
}
