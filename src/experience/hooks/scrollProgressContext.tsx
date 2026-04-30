import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type ScrollProgressContextType = {
  /** Current scroll progress (0-1) */
  progress: number;
  /** Set the scroll progress (called by timeline hooks) */
  setProgress: (progress: number) => void;
  /** Total timeline duration in seconds */
  totalDuration: number;
  /** Set total duration */
  setTotalDuration: (duration: number) => void;
  /** Active scene ID */
  activeScene: string | null;
  /** Set active scene */
  setActiveScene: (sceneId: string | null) => void;
  /** Scene ranges for mapping progress to scenes */
  sceneRanges: Array<{
    sceneId: string;
    startProgress: number;
    endProgress: number;
  }>;
  /** Register scene ranges */
  setSceneRanges: (ranges: ScrollProgressContextType["sceneRanges"]) => void;
};

const ScrollProgressContext = createContext<ScrollProgressContextType | null>(null);

export function ScrollProgressProvider({ children }: { children: ReactNode }) {
  const [progress, setProgressState] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [activeScene, setActiveScene] = useState<string | null>(null);
  const [sceneRanges, setSceneRanges] = useState<ScrollProgressContextType["sceneRanges"]>([]);

  const setProgress = useCallback((newProgress: number) => {
    setProgressState(newProgress);
    
    // Auto-detect active scene from ranges
    if (sceneRanges.length > 0) {
      const active = sceneRanges.find(
        (range) =>
          newProgress >= range.startProgress && newProgress < range.endProgress
      );
      if (active) {
        setActiveScene(active.sceneId);
      }
    }
  }, [sceneRanges]);

  return (
    <ScrollProgressContext.Provider
      value={{
        progress,
        setProgress,
        totalDuration,
        setTotalDuration,
        activeScene,
        setActiveScene,
        sceneRanges,
        setSceneRanges,
      }}
    >
      {children}
    </ScrollProgressContext.Provider>
  );
}

export function useScrollProgress(): ScrollProgressContextType {
  const context = useContext(ScrollProgressContext);
  if (!context) {
    throw new Error("useScrollProgress must be used within ScrollProgressProvider");
  }
  return context;
}

/**
 * Hook to get just the progress value (for performance-critical components)
 */
export function useScrollProgressValue(): number {
  const context = useContext(ScrollProgressContext);
  return context?.progress ?? 0;
}
