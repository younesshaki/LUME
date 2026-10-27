import { Inventory } from "./Inventory";
import { safeMediaSource } from "@lume/blocks/block-media";
import ProductGrid from "./ProductGrid";
import { isBlockVisibleInMode } from "@lume/blocks/visibility";
import { VehicleDetailUnavailable } from "@lume/blocks/react/VehicleDetailUnavailable";
import { VehicleCollection } from "./VehicleCollection";
import QuickSearch from "./QuickSearch";
import { vehicleRepository } from "../../server/vehicles/data";
import { DealershipSection } from "@lume/blocks/react/DealershipSection";
import { VehicleSpecTable } from "@lume/blocks/react/VehicleSpecTable";
import { AnnouncementBar } from "@lume/blocks/react/AnnouncementBar";
import {
  TrustStats,
  LogoMarquee,
  FaqAccordion,
} from "@lume/blocks/react/TrustInteractive";
import { storyManifest } from "@lume/blocks/story-manifest";
import { BlockAppearanceView } from "@lume/blocks/react/BlockAppearanceFrame";
import { resolveBlockAppearance } from "@lume/blocks/resolved-appearance";
import { contentContext } from "../../server/content/context";
import { getTenantSiteDesignStyles } from "@lume/blocks/theme-styles";
import type { PageBlock } from "@lume/types";
import { HeroView } from "@lume/blocks/react/Hero";
import { AutomotiveHeroView } from "@lume/blocks/react/AutomotiveHero";
import { FeatureBandView } from "@lume/blocks/react/FeatureBand";
import { RichText } from "@lume/blocks/react/RichText";
import { StatementList } from "@lume/blocks/react/StatementList";
import { ProductGridView } from "@lume/blocks/react/ProductGrid";
import { ProductCardView } from "@lume/blocks/react/ProductCard";
import { FlatShowcaseCardView } from "@lume/blocks/react/ShowcaseCard";
import * as media from "@lume/blocks/react/DealershipMedia";
import * as trust from "@lume/blocks/react/DealershipTrust";
import * as ctas from "@lume/blocks/react/DealershipCtas";
import { stringProp } from "@lume/blocks/react/props";
import { createProductCatalog } from "@lume/blocks/product-catalog";
import { validateBlock, getBlockDescriptor } from "@lume/blocks";
import InteractiveForms from "./InteractiveForms";

type Props = {
  blocks: PageBlock[];
  slug: string;
  title: string;
  tenant: string;
  mode: "light" | "dark";
  template: string;
};
export async function ServerBlocks({ blocks, slug, title, tenant }: Props) {
  const context = await contentContext();
  const palettes = Object.fromEntries(
    ["light", "dark"].map((mode) => {
      const s = getTenantSiteDesignStyles(
        context.design,
        mode as "light" | "dark",
      );
      return [mode, { colors: s.theme.colors ?? {}, variables: s.variables }];
    }),
  ) as Parameters<typeof resolveBlockAppearance>[1]["palettes"];
  const mediaUrl = (key: string) =>
    `${process.env.WEB_PREVIEW_R2_PUBLIC_BASE_URL?.replace(/\/$/, "") ?? ""}/${key}`;
  const catalog = createProductCatalog(mediaUrl);
  const needsFacets = blocks.some(
    (b) =>
      b.type === "vehicle-search-band" ||
      (b.type === "hero" && b.props.variant === "search"),
  );
  const facets = needsFacets
    ? (
        await vehicleRepository().facets(
          context.tenant.tenantId,
          new URLSearchParams({ tenant }),
        )
      ).facets
    : { makes: [], models: [], states: [], cities: [] };
  let heading = false;
  const rendered = blocks
    .filter(
      (b) =>
        validateBlock(b).ok &&
        getBlockDescriptor(b.type) &&
        isBlockVisibleInMode(getBlockDescriptor(b.type)!, "standard"),
    )
    .map((block) => {
      const props = { block, mode: "standard" as const };
      let content;
      switch (block.type) {
        case "hero": {
          const variant = stringProp(block, "variant", "classic");
          const level = heading ? 2 : 1;
          heading = true;
          content = (
            <HeroView
              {...props}
              pageSlug={slug}
              headingLevel={level}
              automotiveHero={
                ["split", "search", "fullBleed"].includes(variant) ? (
                  <AutomotiveHeroView
                    {...props}
                    headingLevel={level}
                    variant={variant as "split" | "search" | "fullBleed"}
                    quickSearch={
                      <QuickSearch
                        tenant={tenant}
                        initialFacets={facets}
                        className="autoHeroSearch"
                        buttonLabel={
                          stringProp(block, "primaryCtaLabel") ||
                          "Search inventory"
                        }
                        showCondition
                      />
                    }
                  />
                ) : undefined
              }
            />
          );
          break;
        }
        case "feature-band":
          content = <FeatureBandView {...props} mediaUrl={mediaUrl} />;
          break;
        case "rich-text":
          content = <RichText {...props} />;
          break;
        case "statement-list":
          content = <StatementList {...props} />;
          break;
        case "product-grid": {
          content = (
            <ProductGrid
              block={block}
              products={catalog.PRODUCTS}
              categories={catalog.PRODUCT_CATEGORIES}
              tenant={tenant}
            />
          );
          break;
        }
        case "showcase-gallery": {
          const ids = Array.isArray(block.props.chapterIds)
            ? block.props.chapterIds
            : [];
          const chapters = storyManifest
            .flatMap((p) => p.chapters)
            .filter((c) => !ids.length || ids.includes(c.id));
          const products = chapters.map((chapter, index) => ({
            product: catalog.getShowcasePreviewForChapter(chapter.id, index),
            chapter,
          }));
          content = (
            <section
              className={
                slug === "showcase"
                  ? "showcasePage__cards"
                  : "storyHome__showcaseCards"
              }
              aria-label="LUME showcases"
            >
              {stringProp(block, "title") && (
                <h2 className="showcasePage__eyebrow">
                  {stringProp(block, "title")}
                </h2>
              )}
              {products.map(({ product: p, chapter }) => (
                <FlatShowcaseCardView
                  key={p.id}
                  title={chapter.title}
                  imageSrc={p.imageSrc ?? mediaUrl("blackredbullcycles.png")}
                  imageAlt={`${p.brand} ${p.name} LUME showcase preview`}
                  href={`/products/${encodeURIComponent(p.id)}?tenant=${tenant}`}
                />
              ))}
            </section>
          );
          break;
        }
        case "split-feature":
          content = (
            <media.SplitFeature
              {...props}
              mediaSource={(v) => safeMediaSource(v, mediaUrl)}
            />
          );
          break;
        case "gallery-masonry":
          content = (
            <media.GalleryMasonry
              {...props}
              mediaSource={(v) => safeMediaSource(v, mediaUrl)}
            />
          );
          break;
        case "map-hours":
          content = <media.MapHours {...props} />;
          break;
        case "video-embed":
          content = <media.VideoEmbed {...props} />;
          break;
        case "footer-contact":
          content = <media.FooterContact {...props} />;
          break;
        case "testimonials":
          content = <trust.Testimonials {...props} />;
          break;
        case "review-summary":
          content = <trust.ReviewSummary {...props} />;
          break;
        case "services-list":
          content = <trust.ServicesList {...props} />;
          break;
        case "how-it-works":
          content = <trust.HowItWorks {...props} />;
          break;
        case "team-grid":
          content = <trust.TeamGrid {...props} />;
          break;
        case "cta-banner":
          content = <ctas.CtaBanner {...props} />;
          break;
        case "whatsapp-cta":
          content = <ctas.WhatsAppCta {...props} />;
          break;
        case "lead-capture-form":
        case "service-booking":
        case "test-drive-booking":
        case "newsletter-signup":
        case "trade-in-form":
        case "finance-calculator":
          content = (
            <InteractiveForms
              tenant={tenant}
              block={block}
              siteKey={process.env.WEB_PREVIEW_TURNSTILE_SITE_KEY}
            />
          );
          break;
        case "vehicle-inventory":
          content = <Inventory block={block} />;
          break;
        case "featured-vehicles":
        case "new-arrivals":
          content = <VehicleCollection block={block} />;
          break;
        case "vehicle-detail":
          content = <VehicleDetailUnavailable />;
          break;
        case "vehicle-spec-table":
          content = <VehicleSpecTable {...props} />;
          break;
        case "vehicle-search-band":
          content = (
            <DealershipSection
              block={block}
              className="dealershipBlock--search"
            >
              <QuickSearch
                tenant={tenant}
                initialFacets={facets}
                className="vehicleSearchBand"
                buttonLabel={stringProp(block, "buttonLabel")}
                defaultBudget={Number(block.props.defaultBudget) || 0}
              />
            </DealershipSection>
          );
          break;
        case "announcement-bar":
          content = <AnnouncementBar {...props} />;
          break;
        case "trust-stats":
          content = <TrustStats {...props} animateNumbers={false} />;
          break;
        case "logo-marquee":
          content = (
            <LogoMarquee
              {...props}
              mediaBase={process.env.WEB_PREVIEW_R2_PUBLIC_BASE_URL}
            />
          );
          break;
        case "faq-accordion":
          content = <FaqAccordion {...props} progressive />;
          break;
        default:
          throw new Error("Published block has no server adapter");
      }
      return (
        <div
          key={block.id}
          data-block-id={block.id}
          style={{ display: "contents" }}
        >
          <BlockAppearanceView
            block={block}
            resolved={resolveBlockAppearance(block.appearance, {
              mode: context.mode,
              palettes,
            })}
          >
            {content}
          </BlockAppearanceView>
        </div>
      );
    });
  return (
    <>
      {!heading && <h1 className="contactPage__title">{title}</h1>}
      {rendered}
    </>
  );
}
