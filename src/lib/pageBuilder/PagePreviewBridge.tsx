import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  PREVIEW_CHANNEL,
  isPreviewInboundMessage,
  type BlockMode,
  type PreviewDocument,
  type PreviewInboundMessage,
} from "@lume/blocks";
import type { PageBlock } from "@lume/types";
import { publicTenantSlug } from "@/lib/publicTenant";
import { PageBlocksView } from "./PageRenderer";

/**
 * The live-preview endpoint the admin embeds in an iframe (route `/__preview`).
 *
 * It never fetches a published page: the admin editor streams the *draft* block
 * document in over `postMessage`, and we render it through the exact same
 * {@link PageBlocksView} the production site uses. That is what makes the preview
 * a true reflection of the live site rather than a hand-maintained lookalike —
 * and it is the substrate a future drag-and-drop editor will speak over.
 */
export default function PagePreviewBridge() {
  const [doc, setDoc] = useState<PreviewDocument | null>(null);
  const [mode, setMode] = useState<BlockMode>("standard");
  // Remember who to answer so the parent can be told when a block is clicked
  // (drag-and-drop / selection lands here next).
  const parentOrigin = useRef<string>("*");

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!isPreviewInboundMessage(event.data)) return;
      parentOrigin.current = event.origin || "*";
      applyMessage(event.data);
    }

    function applyMessage(message: PreviewInboundMessage) {
      if (message.type === "update") {
        setDoc(message.doc);
        if (message.mode) setMode(message.mode);
      }
    }

    window.addEventListener("message", onMessage);
    // Announce readiness so the editor knows it can start streaming the draft.
    post({ channel: PREVIEW_CHANNEL, type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function post(message: unknown) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(message, parentOrigin.current);
    }
  }

  if (!doc) {
    return (
      <div style={PLACEHOLDER_STYLE} role="status">
        <span>Connecting the live preview…</span>
      </div>
    );
  }

  if (doc.blocks.length === 0) {
    return (
      <div style={PLACEHOLDER_STYLE}>
        <p style={{ margin: 0, fontWeight: 600 }}>This page has no blocks yet.</p>
        <p style={{ margin: "8px 0 0", maxWidth: "36ch", opacity: 0.7 }}>
          Add a block in the editor to see it render here exactly as visitors will.
        </p>
      </div>
    );
  }

  return (
    <>
      <style>{PREVIEW_BLOCK_STYLES}</style>
      <PageBlocksView
        slug={doc.slug}
        blocks={doc.blocks as PageBlock[]}
        mode={mode}
        blockWrapper={selectableBlockWrapper}
      />
    </>
  );

  function selectableBlockWrapper(block: PageBlock, children: ReactNode): ReactNode {
    return (
      <div
        data-lume-preview-block={block.id}
        className="lume-preview-block"
        onClickCapture={(event) => {
          // The preview is an editing surface: clicks select blocks in the
          // editor instead of triggering links/buttons inside the page.
          event.preventDefault();
          event.stopPropagation();
          post({ channel: PREVIEW_CHANNEL, type: "block-selected", blockId: block.id });
        }}
      >
        {children}
      </div>
    );
  }
}

/** Hover affordance for click-to-select; gold, on-brand, preview-only. */
const PREVIEW_BLOCK_STYLES = `
.lume-preview-block { cursor: pointer; }
.lume-preview-block:hover {
  outline: 2px solid rgba(201, 162, 39, 0.7);
  outline-offset: 2px;
}
`;

const PLACEHOLDER_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "100vh",
  padding: "24px",
  textAlign: "center",
  color: "#f5f5f5",
  background: "#070708",
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontSize: "14px",
};

// Re-export for callers that only need the tenant the preview is rendering.
export { publicTenantSlug };
