import { describe, expect, it } from "vitest";
import {
  calculateMonthlyPayment,
  parseStatistic,
  safeLink,
  safeMapEmbedUrl,
  safeMediaSource,
  splitDelimitedValue,
  whatsappHref,
  youtubeOrVimeoEmbedUrl,
} from "./dealershipBlockUtils";

describe("dealership block URL safety", () => {
  it("accepts supported links and rejects executable or protocol-relative URLs", () => {
    expect(safeLink("/vehicles")).toBe("/vehicles");
    expect(safeLink("#inventory")).toBe("#inventory");
    expect(safeLink("https://dealer.example/contact")).toBe(
      "https://dealer.example/contact",
    );
    expect(safeLink("javascript:alert(1)")).toBeUndefined();
    expect(safeLink("//attacker.example")).toBeUndefined();
  });

  it("resolves public media safely", () => {
    expect(safeMediaSource("/showroom.webp")).toBe("/showroom.webp");
    expect(safeMediaSource("https://cdn.example/showroom.webp")).toBe(
      "https://cdn.example/showroom.webp",
    );
    expect(safeMediaSource("javascript:alert(1)")).toBeUndefined();
  });

  it("normalizes WhatsApp numbers and bounds invalid numbers", () => {
    expect(whatsappHref("+1 (555) 123-4567", "Hello there")).toBe(
      "https://wa.me/15551234567?text=Hello+there",
    );
    expect(whatsappHref("123")).toBeUndefined();
  });

  it("creates privacy-conscious video embeds only for supported providers", () => {
    expect(youtubeOrVimeoEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    expect(
      youtubeOrVimeoEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    ).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(youtubeOrVimeoEmbedUrl("https://vimeo.com/123456789")).toBe(
      "https://player.vimeo.com/video/123456789",
    );
    expect(youtubeOrVimeoEmbedUrl("https://example.com/video")).toBeUndefined();
    expect(youtubeOrVimeoEmbedUrl("ftp://youtube.com/watch?v=dQw4w9WgXcQ"))
      .toBeUndefined();
  });

  it("allows only HTTPS Google or OpenStreetMap embeds", () => {
    expect(safeMapEmbedUrl("https://maps.google.com/maps?q=Monaco&output=embed"))
      .toBe("https://maps.google.com/maps?q=Monaco&output=embed");
    expect(safeMapEmbedUrl("https://www.openstreetmap.org/export/embed.html"))
      .toBe("https://www.openstreetmap.org/export/embed.html");
    expect(safeMapEmbedUrl("http://maps.google.com/maps?q=Monaco"))
      .toBeUndefined();
    expect(safeMapEmbedUrl("https://example.com/map")).toBeUndefined();
  });
});

describe("dealership block value parsing", () => {
  it("parses bounded statistic values and suffixes", () => {
    expect(parseStatistic("4.9|1|/5")).toEqual({
      value: 4.9,
      decimalPlaces: 1,
      suffix: "/5",
    });
    expect(parseStatistic("invalid|20|a very long suffix value")).toEqual({
      value: 0,
      decimalPlaces: 3,
      suffix: "a very long suff",
    });
  });

  it("splits editor-friendly compound values at the first separator", () => {
    expect(splitDelimitedValue("Sales Director|Performance|Luxury")).toEqual({
      first: "Sales Director",
      second: "Performance|Luxury",
    });
  });

  it("calculates amortized and zero-interest payments safely", () => {
    expect(calculateMonthlyPayment(60_000, 12_000, 0, 48)).toBe(1_000);
    expect(calculateMonthlyPayment(85_000, 15_000, 6.9, 60)).toBeCloseTo(
      1_382.76,
      1,
    );
    expect(calculateMonthlyPayment(10_000, 12_000, 5, 36)).toBe(0);
    expect(calculateMonthlyPayment(Number.POSITIVE_INFINITY, 0, 5, 36)).toBe(0);
  });
});
