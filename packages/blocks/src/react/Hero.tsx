import type { ReactNode } from "react";
import type { BlockComponentProps } from "./types";
import { stringProp } from "./props";

type HeroSkin = {
  section: string;
  copy?: string;
  lamp?: string;
  eyebrow: string;
  title: string;
  subtitle: string;
};

const HERO_SKINS: Record<string, HeroSkin> = {
  contact: {
    section: "contactPage__hero",
    eyebrow: "contactPage__eyebrow",
    title: "contactPage__title",
    subtitle: "contactPage__lead",
  },
  home: {
    section: "storyHome__hero",
    copy: "storyHome__heroCopy",
    lamp: "storyHome__lamp",
    eyebrow: "storyHome__eyebrow",
    title: "storyHome__title",
    subtitle: "storyHome__subtitle",
  },
  products: {
    section: "productsPage__hero",
    lamp: "productsPage__lamp",
    eyebrow: "productsPage__eyebrow",
    title: "productsPage__title",
    subtitle: "productsPage__subtitle",
  },
  showcase: {
    section: "showcasePage__hero",
    eyebrow: "showcasePage__eyebrow",
    title: "",
    subtitle: "",
  },
  vehicles: {
    section: "vehiclesPage__hero",
    lamp: "vehiclesPage__lamp",
    eyebrow: "vehiclesPage__eyebrow",
    title: "vehiclesPage__title",
    subtitle: "vehiclesPage__subtitle",
  },
};

export function HeroView({
  block,
  mode,
  pageSlug,
  automotiveHero,
  headingLevel = 1,
}: BlockComponentProps & {
  pageSlug: string;
  automotiveHero?: ReactNode;
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  // Photo designs render their own markup; `classic` (and any stored hero from
  // before variants) keeps the page-specific skins below, unchanged.
  const variant = stringProp(block, "variant", "classic");
  if (variant === "split" || variant === "search" || variant === "fullBleed") {
    return automotiveHero ?? null;
  }
  const skin = HERO_SKINS[pageSlug] ?? HERO_SKINS.home;
  const eyebrow = stringProp(block, "eyebrow");
  const title = stringProp(block, "title");
  const subtitle = stringProp(block, "subtitle");
  const primaryLabel = stringProp(block, "primaryCtaLabel");
  const primaryHref = stringProp(block, "primaryCtaHref");
  const secondaryLabel = stringProp(block, "secondaryCtaLabel");
  const secondaryHref = stringProp(block, "secondaryCtaHref");
  const alignment = stringProp(block, "alignment", "center");
  const sectionClassName = [
    skin.section,
    "pageBuilderHero",
    alignment === "left" ? "pageBuilderHero--left" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {skin.lamp && <div className={skin.lamp} aria-hidden="true" />}
      {eyebrow && <p className={skin.eyebrow}>{eyebrow}</p>}
      {skin.title ? (
        <Heading className={skin.title}>{title}</Heading>
      ) : (
        <Heading>{title}</Heading>
      )}
      {subtitle &&
        (skin.subtitle ? (
          <p className={skin.subtitle}>{subtitle}</p>
        ) : (
          <p>{subtitle}</p>
        ))}
      {(primaryLabel && primaryHref) || (secondaryLabel && secondaryHref) ? (
        <div className="pageBuilderHero__ctas">
          {primaryLabel && primaryHref && (
            <a className="pageBuilderHero__cta" href={primaryHref}>
              {primaryLabel}
            </a>
          )}
          {secondaryLabel && secondaryHref && (
            <a
              className="pageBuilderHero__cta pageBuilderHero__cta--secondary"
              href={secondaryHref}
            >
              {secondaryLabel}
            </a>
          )}
        </div>
      ) : null}
    </>
  );

  return (
    <section className={sectionClassName}>
      {skin.copy ? <div className={skin.copy}>{content}</div> : content}
    </section>
  );
}
