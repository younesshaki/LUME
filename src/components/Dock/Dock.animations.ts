import { useEffect, useRef } from "react";
import { dockSounds } from "./Dock.sounds";

export function useDockAdaptation(shouldAdapt: boolean, setAdapted: (adapted: boolean) => void) {
  const wasAdapted = useRef(false);

  useEffect(() => {
    if (shouldAdapt === wasAdapted.current) return;

    wasAdapted.current = shouldAdapt;
    setAdapted(shouldAdapt);

    if (shouldAdapt) {
      dockSounds.adaptStart();
    } else {
      dockSounds.adaptEnd();
    }
  }, [setAdapted, shouldAdapt]);
}
