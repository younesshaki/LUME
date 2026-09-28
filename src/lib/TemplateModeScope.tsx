import type { ReactNode } from "react";
import { FixedDualMode } from "./DualModeContext";
import { isAutomotiveEditorial, useActiveSiteTemplate } from "./useActiveSiteTemplate";

/**
 * Template Glo3D is a flat, standard-mode template: its pages render every
 * block's standard form (no 3D cards, spotlights or cinematic motion), however
 * the visitor last set the cinematic toggle on another site.
 */
export function TemplateModeScope({ children }: { children: ReactNode }) {
  const template = useActiveSiteTemplate();
  if (isAutomotiveEditorial(template)) return <FixedDualMode mode="standard">{children}</FixedDualMode>;
  return <>{children}</>;
}
