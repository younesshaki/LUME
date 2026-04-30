import { createContext, useContext } from "react";

type SoundContextValue = {
  soundEnabled: boolean;
  soundBlocked: boolean;
  setSoundBlocked?: (blocked: boolean) => void;
};

const SoundContext = createContext<SoundContextValue>({
  soundEnabled: true,
  soundBlocked: false,
  setSoundBlocked: undefined,
});

export const SoundProvider = SoundContext.Provider;

export const useSoundSettings = () => useContext(SoundContext);
