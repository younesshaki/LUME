import { describe, expect, it } from "vitest";
import {
  PREVIEW_CHANNEL,
  PREVIEW_ROUTE,
  buildPreviewUrl,
  isPreviewInboundMessage,
  isPreviewOutboundMessage,
} from "./previewProtocol";

describe("buildPreviewUrl", () => {
  it("targets the preview route with tenant + preview params", () => {
    const url = buildPreviewUrl("https://site.example.com", "acme");
    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://site.example.com");
    expect(parsed.pathname).toBe(PREVIEW_ROUTE);
    expect(parsed.searchParams.get("tenant")).toBe("acme");
    expect(parsed.searchParams.get("preview")).toBe("lume");
  });

  it("does not double up slashes when the base has a trailing slash", () => {
    expect(buildPreviewUrl("https://site.example.com/", "acme")).toBe(
      buildPreviewUrl("https://site.example.com", "acme")
    );
  });

  it("encodes tenant slugs", () => {
    const url = buildPreviewUrl("https://site.example.com", "a b");
    expect(new URL(url).searchParams.get("tenant")).toBe("a b");
  });
});

describe("isPreviewInboundMessage", () => {
  const doc = { slug: "home", title: "Home", blocks: [] };

  it("accepts a well-formed update", () => {
    expect(
      isPreviewInboundMessage({ channel: PREVIEW_CHANNEL, type: "update", doc })
    ).toBe(true);
  });

  it("rejects other channels and malformed payloads", () => {
    expect(isPreviewInboundMessage({ channel: "other", type: "update", doc })).toBe(false);
    expect(isPreviewInboundMessage({ channel: PREVIEW_CHANNEL, type: "ready" })).toBe(false);
    expect(isPreviewInboundMessage({ channel: PREVIEW_CHANNEL, type: "update" })).toBe(false);
    expect(isPreviewInboundMessage(null)).toBe(false);
    expect(isPreviewInboundMessage("update")).toBe(false);
  });
});

describe("isPreviewOutboundMessage", () => {
  it("accepts ready and block-selected", () => {
    expect(isPreviewOutboundMessage({ channel: PREVIEW_CHANNEL, type: "ready" })).toBe(true);
    expect(
      isPreviewOutboundMessage({ channel: PREVIEW_CHANNEL, type: "block-selected", blockId: "x" })
    ).toBe(true);
  });

  it("rejects foreign traffic", () => {
    expect(isPreviewOutboundMessage({ channel: "x", type: "ready" })).toBe(false);
    expect(isPreviewOutboundMessage({ channel: PREVIEW_CHANNEL, type: "update" })).toBe(false);
  });
});
