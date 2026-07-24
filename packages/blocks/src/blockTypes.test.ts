import { describe, expect, it } from "vitest";
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
  it("exposes the original seven and exactly 26 dealership blocks in the palette", () => {
    expect(listPaletteBlockDescriptors().map((descriptor) => descriptor.type)).toEqual([
      ...EXISTING_BLOCK_TYPES,
      ...DEALERSHIP_BLOCK_TYPES,
    ]);
    expect(listPaletteBlockDescriptors()).toHaveLength(33);
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
      expect([...Object.keys(descriptor?.defaultProps ?? {})].every(
        (prop) => editorFields.has(prop),
      )).toBe(true);
    },
  );

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
