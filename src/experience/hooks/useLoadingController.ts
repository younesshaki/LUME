import { useProgress } from "@react-three/drei";
import { useEffect, useState } from "react";

export function useLoadingController() {
  const { active: loadingActive, progress } = useProgress();
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [canHideLoader, setCanHideLoader] = useState(false);

  // Minimum 2.5 seconds before loader can hide
  useEffect(() => {
    const timer = setTimeout(() => setMinTimeElapsed(true), 2500);
    return () => clearTimeout(timer);
  }, []);

  // Can only hide when both conditions are met:
  // 1. Minimum time has elapsed (2.5 seconds)
  // 2. All assets have finished loading
  useEffect(() => {
    if (minTimeElapsed && !loadingActive) {
      setCanHideLoader(true);
    } else {
      setCanHideLoader(false);
    }
  }, [minTimeElapsed, loadingActive]);

  return {
    canHideLoader,
    isLoading: loadingActive,
    progress: Math.round(progress),
  };
}
