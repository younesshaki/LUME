import { getSiteTemplate, type SiteTemplate } from "@lume/types";
import { useTenantSiteDesign } from "./TenantThemeProvider";

/** The active website template, or null until the tenant's design has loaded. */
export function useActiveSiteTemplate(): SiteTemplate | null {
  const design = useTenantSiteDesign();
  return design ? getSiteTemplate(design.template.key) : null;
}

/** True when the tenant's site uses Template Glo3D (automotive-editorial). */
export function isAutomotiveEditorial(template: SiteTemplate | null): boolean {
  return template?.visual.layout === "automotive-editorial";
}

export function useIsAutomotiveEditorial(): boolean {
  return isAutomotiveEditorial(useActiveSiteTemplate());
}

/**
 * Whether the header may use the animated "gooey" nav. The build flag turns it
 * on site-wide; a template can still opt out (Glo3D uses a flat nav). Until
 * the template is known the plain nav renders, so a Glo3D site never flashes
 * the animated one.
 */
export function allowsGooeyNav(buildFlag: boolean, template: SiteTemplate | null): boolean {
  return buildFlag && template !== null && !isAutomotiveEditorial(template);
}
