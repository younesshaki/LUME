import { mediaUrl } from "@/config/cdn";
import { useTenantSiteDesign, useTenantTheme } from "@/lib/TenantThemeProvider";
import { DEFAULT_PUBLIC_TENANT_SLUG, publicTenantSlug } from "@/lib/publicTenant";

const LUME_LOGO = mediaUrl("LUMElogo.png");

/**
 * Which logo the header and footer show.
 *
 * The LUME logo used to be the fallback while the tenant's theme loaded, so on
 * every dealer page the browser started downloading LUME's logo, aborted it
 * when the dealer's arrived (a failed request per page view on the demo
 * tenant), and could flash LUME's brand first. A dealership now shows nothing
 * in the logo slot until its theme is known; LUME's own site keeps its logo
 * immediately.
 */
export function resolveSiteLogo(input: {
  isHouse: boolean;
  themeLoaded: boolean;
  logoUrl: string | undefined;
}): string | null {
  if (input.logoUrl) return input.logoUrl;
  if (input.isHouse || input.themeLoaded) return LUME_LOGO;
  return null;
}

export function useSiteLogo(): string | null {
  const theme = useTenantTheme();
  const design = useTenantSiteDesign();
  return resolveSiteLogo({
    isHouse: publicTenantSlug === DEFAULT_PUBLIC_TENANT_SLUG,
    themeLoaded: design !== null,
    logoUrl: theme.branding?.logoUrl,
  });
}
