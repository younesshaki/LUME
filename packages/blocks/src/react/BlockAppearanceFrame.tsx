import type { CSSProperties, ReactNode } from "react";
import type { PageBlock } from "@lume/types";
import type { ResolvedBlockAppearance } from "../resolvedAppearance";
export function BlockAppearanceView({
  block,
  children,
  resolved,
}: {
  block: PageBlock;
  children: ReactNode;
  resolved: ResolvedBlockAppearance | null;
}) {
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
            style={{
              objectFit: resolved.image.fit,
              objectPosition: resolved.image.position,
            }}
          />
          <span className="blockAppearance__overlay" />
        </div>
      ) : null}
      {children}
    </div>
  );
}
