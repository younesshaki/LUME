import { useEffect, type ReactNode } from "react";
import { FixedDualMode } from "./DualModeContext";
import { useOptionalTheme } from "./theme/ThemeContext";
import { isAutomotiveEditorial, useActiveSiteTemplate } from "./useActiveSiteTemplate";

/**
 * Applies the template's presentation defaults. Template Glo3D is a flat,
 * standard-mode template: its pages render every block's standard form (no 3D
 * cards, spotlights or cinematic motion), however the visitor last set the
 * cinematic toggle on another site. A template may also set the colour mode a
 * first-time visitor sees (Glo3D: light); the visitor's own choice still wins.
 */
export function TemplateModeScope({ children }: { children: ReactNode }) {
  const template = useActiveSiteTemplate();
  const applySiteDefault = useOptionalTheme()?.applySiteDefault;
  const templateLoaded = template !== null;
  const defaultColorMode = template?.defaultColorMode ?? null;

  useEffect(() => {
    if (templateLoaded) applySiteDefault?.(defaultColorMode);
  }, [applySiteDefault, templateLoaded, defaultColorMode]);

  if (isAutomotiveEditorial(template)) return <FixedDualMode mode="standard">{children}</FixedDualMode>;
  return <>{children}</>;
}
