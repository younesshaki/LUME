import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import {
  persistThemeMode,
  readThemeMode,
  resolveTheme,
  type ResolvedTheme,
  type ThemeMode,
} from "./theme";

type ThemeContextValue = {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
};

type ThemeProviderProps = PropsWithChildren<{
  enabled?: boolean;
}>;

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children, enabled = true }: ThemeProviderProps) {
  if (!enabled) return <>{children}</>;
  return <ActiveThemeProvider>{children}</ActiveThemeProvider>;
}

function ActiveThemeProvider({ children }: PropsWithChildren) {
  const [mode, setStoredMode] = useState<ThemeMode>(readThemeMode);
  const resolvedTheme = resolveTheme(mode);

  useLayoutEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    const previousTheme = root.getAttribute("data-theme");
    root.dataset.theme = resolvedTheme;

    return () => {
      if (previousTheme === null) {
        delete root.dataset.theme;
      } else {
        root.dataset.theme = previousTheme;
      }
    };
  }, [resolvedTheme]);

  const setMode = useCallback((nextMode: ThemeMode) => {
    persistThemeMode(nextMode);
    setStoredMode(nextMode);
  }, []);

  const value = useMemo(
    () => ({ mode, resolvedTheme, setMode }),
    [mode, resolvedTheme, setMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider.");
  return value;
}
