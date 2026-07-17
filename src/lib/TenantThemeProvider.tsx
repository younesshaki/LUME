import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import type { SiteDesign, TenantTheme } from "@lume/types";
import { useTheme } from "./theme/ThemeContext";
import {
  applyTenantSiteDesign,
  applyTenantTheme,
  loadTenantSiteDesign,
} from "./tenantTheme";

const TenantThemeContext = createContext<TenantTheme>({});

export function useTenantTheme(): TenantTheme {
  return useContext(TenantThemeContext);
}

export function TenantThemeProvider({
  children,
  enabled = true,
}: PropsWithChildren<{ enabled?: boolean }>) {
  if (!enabled) return <>{children}</>;
  return <ActiveTenantThemeProvider>{children}</ActiveTenantThemeProvider>;
}

function ActiveTenantThemeProvider({ children }: PropsWithChildren) {
  const { resolvedTheme } = useTheme();
  const [design, setDesign] = useState<SiteDesign | null>(null);
  const [theme, setTheme] = useState<TenantTheme>({});

  useEffect(() => {
    let cancelled = false;

    async function applyTheme() {
      const design = await loadTenantSiteDesign();
      if (!cancelled) {
        setDesign(design);
      }
    }

    void applyTheme();
    return () => {
      cancelled = true;
      applyTenantTheme({});
    };
  }, []);

  useEffect(() => {
    if (!design) return;
    setTheme(applyTenantSiteDesign(design, resolvedTheme));
  }, [design, resolvedTheme]);

  return (
    <TenantThemeContext.Provider value={theme}>
      {children}
    </TenantThemeContext.Provider>
  );
}
