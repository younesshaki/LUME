import { useEffect, type PropsWithChildren } from "react";
import { applyTenantTheme, loadTenantTheme } from "./tenantTheme";

export function TenantThemeProvider({ children }: PropsWithChildren) {
  useEffect(() => {
    let cancelled = false;

    async function applyTheme() {
      const theme = await loadTenantTheme();
      if (!cancelled) applyTenantTheme(theme);
    }

    void applyTheme();
    return () => {
      cancelled = true;
      applyTenantTheme({});
    };
  }, []);

  return <>{children}</>;
}
