import { describe, expect, it } from "vitest";
import { VARIANT_PROP, resolveBlockVariant } from "./variants";
import {
  getBlockDescriptor,
  listPaletteBlockDescriptors,
} from "./blockTypes";

const EXISTING_BLOCK_TYPES = [
  "hero",
  "feature-band",
  "statement-list",
  "rich-text",
  "product-grid",
  "vehicle-inventory",
  "showcase-gallery",
] as const;

const DEALERSHIP_BLOCK_TYPES = [
  "trade-in-form",
  "finance-calculator",
  "test-drive-booking",
  "service-booking",
  "lead-capture-form",
  "whatsapp-cta",
  "cta-banner",
  "announcement-bar",
  "newsletter-signup",
  "featured-vehicles",
  "new-arrivals",
  "vehicle-search-band",
  "vehicle-spec-table",
  "vehicle-detail",
  "testimonials",
  "review-summary",
  "trust-stats",
  "logo-marquee",
  "services-list",
  "how-it-works",
  "faq-accordion",
  "team-grid",
  "split-feature",
  "video-embed",
  "gallery-masonry",
  "map-hours",
  "footer-contact",
] as const;

describe("block descriptors", () => {
  it("exposes the original seven and exactly 27 dealership blocks in the palette", () => {
    expect(listPaletteBlockDescriptors().map((descriptor) => descriptor.type)).toEqual([
      ...EXISTING_BLOCK_TYPES,
      ...DEALERSHIP_BLOCK_TYPES,
    ]);
    expect(listPaletteBlockDescriptors()).toHaveLength(34);
  });

  it.each(DEALERSHIP_BLOCK_TYPES)(
    "%s has valid defaults and complete editor metadata",
    (type) => {
      const descriptor = getBlockDescriptor(type);
      expect(descriptor).toBeDefined();
      expect(descriptor?.type).toBe(type);
      expect(descriptor?.palette).toBe(true);
      expect(descriptor?.modes).toEqual(["experience", "standard"]);
      expect(descriptor?.validate(descriptor.defaultProps)).toEqual({ ok: true });
      expect(descriptor?.validate(undefined).ok).toBe(false);
      expect(descriptor?.validate({}).ok).toBe(false);

      const editorFields = new Set(descriptor?.fields.map((field) => field.name));
      // `variant` is the one prop without a generic editor field: it is
      // presented by the dedicated variant picker instead of a sidebar input.
      // Exempted narrowly — and only for blocks that actually declare variants,
      // so this cannot become a way to smuggle in an uneditable prop.
      const exempt = new Set(
        descriptor?.variants && descriptor.variants.length > 0 ? [VARIANT_PROP] : [],
      );
      expect([...Object.keys(descriptor?.defaultProps ?? {})].every(
        (prop) => editorFields.has(prop) || exempt.has(prop),
      )).toBe(true);
    },
  );

  // The drift guard. A descriptor could declare variants the schema rejects, or
  // forget the default, and nothing else would catch it until a dealer picked
  // the broken one in production.
  it("keeps every declared variant in sync with the schema and defaults", () => {
    for (const type of DEALERSHIP_BLOCK_TYPES) {
      const descriptor = getBlockDescriptor(type);
      const variants = descriptor?.variants;
      if (!variants || variants.length === 0) continue;

      // Ids are unique and non-empty; labels and descriptions are real.
      const ids = variants.map((variant) => variant.id);
      expect(new Set(ids).size, `${type}: duplicate variant ids`).toBe(ids.length);
      for (const variant of variants) {
        expect(variant.id.trim().length, `${type}: empty variant id`).toBeGreaterThan(0);
        expect(variant.label.trim().length, `${type}: empty variant label`).toBeGreaterThan(0);
        expect(variant.description.trim().length, `${type}: empty description`).toBeGreaterThan(0);
      }

      // defaultProps must name the FIRST variant, so an untouched block renders
      // the fallback design rather than something else.
      expect(
        (descriptor.defaultProps as Record<string, unknown>)[VARIANT_PROP],
        `${type}: defaultProps.variant must be the first declared variant`,
      ).toBe(ids[0]);

      // Every declared id must actually validate.
      for (const id of ids) {
        const result = descriptor.validate({ ...descriptor.defaultProps, [VARIANT_PROP]: id });
        expect(result, `${type}: variant "${id}" is declared but rejected by the schema`)
          .toEqual({ ok: true });
      }

      // And an unknown id must fail soft to the first, never blow up a page.
      expect(
        resolveBlockVariant(variants, { [VARIANT_PROP]: "no-such-variant" }),
        `${type}: unknown variant must fall back to the first`,
      ).toBe(ids[0]);
      expect(resolveBlockVariant(variants, {})).toBe(ids[0]);
    }
  });

  it("rejects unsafe or unsupported destinations in media and conversion blocks", () => {
    const cta = getBlockDescriptor("cta-banner");
    expect(cta?.validate({
      ...cta.defaultProps,
      primaryHref: "javascript:alert(1)",
    }).ok).toBe(false);

    const video = getBlockDescriptor("video-embed");
    expect(video?.validate({
      ...video.defaultProps,
      videoUrl: "https://example.com/not-an-embed",
    }).ok).toBe(false);

    const map = getBlockDescriptor("map-hours");
    expect(map?.validate({
      ...map.defaultProps,
      mapEmbedUrl: "https://example.com/map",
    }).ok).toBe(false);

    const gallery = getBlockDescriptor("gallery-masonry");
    expect(gallery?.validate({
      ...gallery.defaultProps,
      items: [{ label: "Unsafe", body: "javascript:alert(1)" }],
    }).ok).toBe(false);
  });

  it("validates the vehicle-card style and colour used by the live preview", () => {
    const inventory = getBlockDescriptor("vehicle-inventory");
    expect(inventory?.validate({
      ...inventory.defaultProps,
      cardStyle: "notch",
      cardColor: "#1A6E8C",
    })).toEqual({ ok: true });
    expect(inventory?.validate({
      ...inventory.defaultProps,
      cardStyle: "notch",
      cardColor: "gold",
    }).ok).toBe(false);
    expect(inventory?.validate({
      ...inventory.defaultProps,
      cardStyle: "unknown",
    }).ok).toBe(false);
    expect(inventory?.validate({
      ...inventory.defaultProps,
      cardStyle: "bento",
      cardColor: "#1A6E8C",
    })).toEqual({ ok: true });
    expect(inventory?.validate({
      ...inventory.defaultProps,
      cardStyle: "bento",
      cardColor: "teal",
    }).ok).toBe(false);
  });
});
