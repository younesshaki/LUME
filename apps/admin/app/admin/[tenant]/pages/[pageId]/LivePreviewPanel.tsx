"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Monitor, RefreshCw, Smartphone, Tablet, ExternalLink } from "lucide-react";
import {
  PREVIEW_CHANNEL,
  buildPreviewUrl,
  isPreviewOutboundMessage,
  type PreviewInboundMessage,
} from "@lume/blocks";
import type { PageBlock } from "@lume/types";

type LivePreviewPanelProps = {
  publicSiteBaseUrl: string;
  tenantSlug: string;
  slug: string;
  title: string;
  blocks: PageBlock[];
  /** Notified when a block is clicked inside the preview (drag/select next). */
  onSelectBlock?: (blockId: string) => void;
};

type Device = "desktop" | "tablet" | "mobile";

const DEVICE_WIDTH: Record<Device, number | null> = {
  desktop: null, // fill the panel
  tablet: 820,
  mobile: 414,
};

const DEVICES: Array<{ id: Device; label: string; icon: typeof Monitor }> = [
  { id: "desktop", label: "Desktop", icon: Monitor },
  { id: "tablet", label: "Tablet", icon: Tablet },
  { id: "mobile", label: "Mobile", icon: Smartphone },
];

/**
 * The real live preview: it embeds the tenant's actual public site (the
 * `/__preview` route) and streams the editor's draft blocks into it over
 * postMessage, so the customer sees exactly what visitors will see before
 * anything is published. No block rendering is re-implemented here — the
 * production components do the drawing inside the iframe.
 */
export function LivePreviewPanel({
  publicSiteBaseUrl,
  tenantSlug,
  slug,
  title,
  blocks,
  onSelectBlock,
}: LivePreviewPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [device, setDevice] = useState<Device>("desktop");
  const [connected, setConnected] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const previewUrl = useMemo(
    () => buildPreviewUrl(publicSiteBaseUrl, tenantSlug),
    [publicSiteBaseUrl, tenantSlug]
  );
  const previewOrigin = useMemo(() => safeOrigin(previewUrl), [previewUrl]);

  const sendDoc = useCallback(() => {
    const target = iframeRef.current?.contentWindow;
    if (!target || !previewOrigin) return;
    const message: PreviewInboundMessage = {
      channel: PREVIEW_CHANNEL,
      type: "update",
      doc: { slug, title, blocks },
      mode: "standard",
    };
    target.postMessage(message, previewOrigin);
  }, [blocks, slug, title, previewOrigin]);

  // Handshake: the bridge announces "ready", then we start streaming.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (previewOrigin && event.origin !== previewOrigin) return;
      if (!isPreviewOutboundMessage(event.data)) return;
      if (event.data.type === "ready") {
        setConnected(true);
        sendDoc();
      } else if (event.data.type === "block-selected") {
        onSelectBlock?.(event.data.blockId);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [previewOrigin, sendDoc, onSelectBlock]);

  // Re-stream on every edit once connected (cheap; the bridge re-renders).
  useEffect(() => {
    if (!connected) return;
    const handle = window.setTimeout(sendDoc, 120);
    return () => window.clearTimeout(handle);
  }, [connected, sendDoc]);

  // A reload resets the handshake.
  useEffect(() => {
    setConnected(false);
  }, [reloadKey]);

  const width = DEVICE_WIDTH[device];
  const misconfigured = !previewOrigin;

  return (
    <section className="mt-6 rounded-lg border border-neutral-200 dark:border-neutral-800">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 p-3 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Live Preview</h2>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              misconfigured
                ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                : connected
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
            }`}
          >
            {misconfigured ? "Not configured" : connected ? "Connected" : "Connecting…"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div className="mr-1 flex items-center gap-0.5 rounded-lg border border-neutral-200 p-0.5 dark:border-neutral-800">
            {DEVICES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                title={label}
                aria-pressed={device === id}
                onClick={() => setDevice(id)}
                className={`rounded-md p-1.5 ${
                  device === id
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                    : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                }`}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
          <button
            type="button"
            title="Reload preview"
            onClick={() => setReloadKey((key) => key + 1)}
            className="rounded-md border border-neutral-200 p-1.5 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-800 dark:hover:bg-neutral-800"
          >
            <RefreshCw className="size-4" />
          </button>
          {!misconfigured && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open preview in a new tab"
              className="rounded-md border border-neutral-200 p-1.5 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-800 dark:hover:bg-neutral-800"
            >
              <ExternalLink className="size-4" />
            </a>
          )}
        </div>
      </div>

      {misconfigured ? (
        <div className="p-6 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Preview site URL isn’t set.</p>
          <p className="mt-1">
            Set <code>NEXT_PUBLIC_PUBLIC_SITE_URL</code> to your public site origin (for local dev,{" "}
            <code>http://localhost:5173</code>) so the editor can embed it.
          </p>
        </div>
      ) : (
        <div className="flex justify-center overflow-auto bg-neutral-100 p-4 dark:bg-neutral-950">
          <div
            className="h-[70vh] w-full overflow-hidden rounded-lg border border-neutral-300 bg-black shadow-sm transition-[max-width] dark:border-neutral-700"
            style={{ maxWidth: width ? `${width}px` : "100%" }}
          >
            <iframe
              key={reloadKey}
              ref={iframeRef}
              src={previewUrl}
              title="Website live preview"
              onLoad={sendDoc}
              className="h-full w-full border-0"
            />
          </div>
        </div>
      )}
    </section>
  );
}

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
