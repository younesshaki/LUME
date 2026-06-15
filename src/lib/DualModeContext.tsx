import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type DualMode = "experience" | "standard";

type DualModeContextValue = {
  mode: DualMode;
  toggleMode: () => void;
};

const STORAGE_KEY = "lume.dualMode";
// Experience keeps the full cinematic/3D presentation enabled by default.
const DEFAULT_MODE: DualMode = "experience";

const DualModeContext = createContext<DualModeContextValue | null>(null);

function readStoredMode(): DualMode {
  if (typeof window === "undefined") {
    return DEFAULT_MODE;
  }

  try {
    const storedMode = window.localStorage.getItem(STORAGE_KEY);
    return storedMode === "standard" || storedMode === "experience"
      ? storedMode
      : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

export function DualModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<DualMode>(readStoredMode);

  const toggleMode = useCallback(() => {
    setMode((currentMode) => {
      const nextMode = currentMode === "experience" ? "standard" : "experience";
      try {
        window.localStorage.setItem(STORAGE_KEY, nextMode);
      } catch {
        // Keep the in-memory toggle working if storage is unavailable.
      }
      return nextMode;
    });
  }, []);

  const value = useMemo(
    () => ({
      mode,
      toggleMode,
    }),
    [mode, toggleMode]
  );

  return (
    <DualModeContext.Provider value={value}>
      {children}
    </DualModeContext.Provider>
  );
}

export function useDualMode(): DualModeContextValue {
  const value = useContext(DualModeContext);

  if (!value) {
    throw new Error("useDualMode must be used inside DualModeProvider.");
  }

  return value;
}
