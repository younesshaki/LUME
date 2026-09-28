import type { CSSProperties } from "react";
import type { BlockComponentProps } from "../registry";
import { numberProp, stringProp } from "./props";
import { VehicleQuickSearch } from "./VehicleQuickSearch";
import "./AutomotiveHero.css";

/**
 * The hero's photo designs: `split`, `search` and `fullBleed` (see
 * HERO_VARIANTS). Introduced with Template Glo3D; usable by any template.
 *
 * Sources (MIT, adapted — see docs/template-glo3d-sources.md):
 *  - split: HyperUI marketing banner 3 (copy beside media);
 *  - fullBleed: Flowbite Jumbotron "Background image" (photo + darkening
 *    overlay), made left-aligned;
 *  - search: Flowbite Jumbotron "with form" (copy beside a bordered panel),
 *    over the full-bleed photo, with the shared VehicleQuickSearch.
 */
type AutomotiveHeroVariant = "split" | "search" | "fullBleed";

export function AutomotiveHero({ block, variant }: BlockComponentProps & { variant: AutomotiveHeroVariant }) {
  const eyebrow = stringProp(block, "eyebrow");
  const title = stringProp(block, "title");
  const subtitle = stringProp(block, "subtitle");
  const mediaUrl = stringProp(block, "mediaUrl");
  const mediaAlt = stringProp(block, "mediaAlt");
  const overlay = Math.min(80, Math.max(0, numberProp(block, "overlayStrength", 45)));
  const photoOnLeft = stringProp(block, "mediaPosition", "right") === "left";

  const copy = (
    <>
      {eyebrow ? <p className="autoHero__eyebrow">{eyebrow}</p> : null}
      <h1 className="autoHero__title">{title}</h1>
      {subtitle ? <p className="autoHero__subtitle">{subtitle}</p> : null}
    </>
  );

  if (variant === "split") {
    return (
      <section className={`autoHero autoHero--split${photoOnLeft ? " autoHero--photoLeft" : ""}`}>
        <div className="autoHero__inner">
          <div className="autoHero__copy">
            {copy}
            <HeroActions block={block} />
          </div>
          <div className="autoHero__media">
            {mediaUrl ? (
              <img
                src={mediaUrl}
                srcSet={responsiveSrcSet(mediaUrl)}
                sizes="(min-width: 768px) 50vw, 100vw"
                alt={mediaAlt}
                loading="eager"
                decoding="async"
              />
            ) : (
              <div className="autoHero__mediaPlaceholder" aria-hidden="true" />
            )}
          </div>
        </div>
      </section>
    );
  }

  const photoStyle = { "--auto-hero-overlay": String(overlay / 100) } as CSSProperties;
  return (
    <section className={`autoHero autoHero--photo autoHero--${variant}`} style={photoStyle}>
      {mediaUrl ? (
        <img
          className="autoHero__backdrop"
          src={mediaUrl}
          srcSet={responsiveSrcSet(mediaUrl)}
          sizes="100vw"
          alt={mediaAlt}
          loading="eager"
          decoding="async"
        />
      ) : null}
      <div className="autoHero__overlay" aria-hidden="true" />
      <div className="autoHero__inner">
        <div className="autoHero__copy">
          {copy}
          {variant === "fullBleed" ? <HeroActions block={block} /> : null}
        </div>
        {variant === "search" ? (
          <VehicleQuickSearch
            className="autoHeroSearch"
            buttonLabel={stringProp(block, "primaryCtaLabel") || "Search inventory"}
            showCondition
          />
        ) : null}
      </div>
    </section>
  );
}

function HeroActions({ block }: Pick<BlockComponentProps, "block">) {
  const primaryLabel = stringProp(block, "primaryCtaLabel");
  const primaryHref = stringProp(block, "primaryCtaHref");
  const secondaryLabel = stringProp(block, "secondaryCtaLabel");
  const secondaryHref = stringProp(block, "secondaryCtaHref");
  const hasPrimary = Boolean(primaryLabel && primaryHref);
  const hasSecondary = Boolean(secondaryLabel && secondaryHref);
  if (!hasPrimary && !hasSecondary) return null;
  return (
    <div className="autoHero__actions">
      {hasPrimary ? (
        <a className="autoHero__button autoHero__button--primary" href={primaryHref}>
          {primaryLabel}
        </a>
      ) : null}
      {hasSecondary ? (
        <a className="autoHero__button autoHero__button--secondary" href={secondaryHref}>
          {secondaryLabel}
        </a>
      ) : null}
    </div>
  );
}

/**
 * Template photos are uploaded at 2400px with a `-1200.webp` sibling (plan §5),
 * so phones download the small one. Any other URL is used as-is.
 */
export function responsiveSrcSet(url: string): string | undefined {
  const match = /^(.*\/templates\/glo3d\/[a-z0-9-]+?)(?:-1200)?\.webp$/i.exec(url);
  if (!match) return undefined;
  return `${match[1]}-1200.webp 1200w, ${match[1]}.webp 2400w`;
}
