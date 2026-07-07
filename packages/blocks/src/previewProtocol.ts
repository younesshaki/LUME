/**
 * The postMessage contract between the admin page editor and the live-preview
 * iframe (the public site's `/__preview` route).
 *
 * The editor streams the current *draft* block document into the iframe, which
 * renders it through the real production block components. Keeping the wire
 * shape here — in a package both apps depend on — means the two sides can never
 * drift. New message kinds (block selection, drag targets) get added here first.
 */
import type { PageBlock } from "@lume/types";
import type { BlockMode } from "./blockTypes";

/** Tags every preview message so unrelated postMessage traffic is ignored. */
export const PREVIEW_CHANNEL = "lume-preview" as const;

/** The public site route that hosts the preview bridge. */
export const PREVIEW_ROUTE = "/__preview" as const;

export type PreviewDocument = {
  slug: string;
  title: string;
  blocks: PageBlock[];
};

/** Editor → iframe. */
export type PreviewInboundMessage = {
  channel: typeof PREVIEW_CHANNEL;
  type: "update";
  doc: PreviewDocument;
  mode?: BlockMode;
};

/** iframe → editor. */
export type PreviewOutboundMessage =
  | { channel: typeof PREVIEW_CHANNEL; type: "ready" }
  | { channel: typeof PREVIEW_CHANNEL; type: "block-selected"; blockId: string };

function isChanneled(value: unknown): value is { channel: unknown; type: unknown } {
  return typeof value === "object" && value !== null && "channel" in value && "type" in value;
}

export function isPreviewInboundMessage(value: unknown): value is PreviewInboundMessage {
  if (!isChanneled(value)) return false;
  const message = value as Record<string, unknown>;
  return (
    message.channel === PREVIEW_CHANNEL &&
    message.type === "update" &&
    typeof message.doc === "object" &&
    message.doc !== null
  );
}

export function isPreviewOutboundMessage(value: unknown): value is PreviewOutboundMessage {
  if (!isChanneled(value)) return false;
  const message = value as Record<string, unknown>;
  return (
    message.channel === PREVIEW_CHANNEL &&
    (message.type === "ready" || message.type === "block-selected")
  );
}

/** Build the iframe src for a tenant's preview endpoint on its public site. */
export function buildPreviewUrl(publicSiteBaseUrl: string, tenantSlug: string): string {
  const base = publicSiteBaseUrl.replace(/\/+$/, "");
  const params = new URLSearchParams({ tenant: tenantSlug, preview: "lume" });
  return `${base}${PREVIEW_ROUTE}?${params.toString()}`;
}
