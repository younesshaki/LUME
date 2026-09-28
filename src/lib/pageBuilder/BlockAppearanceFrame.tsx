import { useMemo, type CSSProperties, type ReactNode } from "react";
import type { PageBlock } from "@lume/types";
import { useTenantSiteDesign } from "@/lib/TenantThemeProvider";
import { getTenantSiteDesignStyles } from "@/lib/tenantTheme";
import { useOptionalTheme } from "@/lib/theme/ThemeContext";
import { resolveBlockAppearance, type ModePalette, type SiteColorMode } from "./blockAppearance";
import "./BlockAppearanceFrame.css";

/**
 * Draws a block's background colour/image (PageBlock.appearance) behind it.
 * A block without one renders with no extra element at all.
 */
export function BlockAppearanceFrame({ block, children }: { block: PageBlock; children: ReactNode }) {
  const design = useTenantSiteDesign();
  const mode: SiteColorMode = useOptionalTheme()?.resolvedTheme ?? "dark";

  const palettes = useMemo(() => {
    if (!design || !block.appearance) return null;
    const palette = (m: SiteColorMode): ModePalette => {
      const styles = getTenantSiteDesignStyles(design, m);
      return { colors: styles.theme.colors ?? {}, variables: styles.variables };
    };
    return { light: palette("light"), dark: palette("dark") };
  }, [design, block.appearance]);

  const resolved = useMemo(
    () => resolveBlockAppearance(block.appearance, { mode, palettes }),
    [block.appearance, mode, palettes],
  );
  if (!resolved) return <>{children}</>;

  return (
    <div
      className="blockAppearance"
      data-block-appearance={block.type}
      data-block-tone={resolved.tone ?? undefined}
      data-full-width={resolved.fullWidth ? "true" : undefined}
      style={resolved.style as CSSProperties}
    >
      {resolved.image ? (
        <div className="blockAppearance__media" aria-hidden="true">
          <img
            src={resolved.image.url}
            alt=""
            loading="lazy"
            decoding="async"
            style={{ objectFit: resolved.image.fit, objectPosition: resolved.image.position }}
          />
          <span className="blockAppearance__overlay" />
        </div>
      ) : null}
      {children}
    </div>
  );
}
