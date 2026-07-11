import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import type { TenantTheme } from "@lume/types";
import { applyTenantTheme, loadTenantTheme } from "./tenantTheme";

const TenantThemeContext = createContext<TenantTheme>({});

export function useTenantTheme(): TenantTheme {
  return useContext(TenantThemeContext);
}

export function TenantThemeProvider({ children }: PropsWithChildren) {
  const [theme, setTheme] = useState<TenantTheme>({});

  useEffect(() => {
    let cancelled = false;

    async function applyTheme() {
      const loadedTheme = await loadTenantTheme();
      if (!cancelled) {
        setTheme(loadedTheme);
        applyTenantTheme(loadedTheme);
      }
    }

    void applyTheme();
    return () => {
      cancelled = true;
      applyTenantTheme({});
    };
  }, []);

  return (
    <TenantThemeContext.Provider value={theme}>
      {children}
    </TenantThemeContext.Provider>
  );
}
