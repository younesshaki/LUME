/**
 * LUME Sound System — provider
 *
 * Mount once at the app root. Initializes the engine (autoplay-policy
 * unlock listener only). Renders children unchanged — no
 * wrapping markup, no context value (engine is module-global).
 */

import { useEffect, type ReactNode } from "react";
import { init as initEngine } from "./audioEngine";

type SoundProviderProps = {
  children: ReactNode;
};

export function SoundProvider({ children }: SoundProviderProps) {
  useEffect(() => {
    initEngine();
  }, []);

  return <>{children}</>;
}
