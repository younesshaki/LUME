"use client";

import { useMemo, useRef, useState } from "react";
import { Send, Sparkles, Undo2 } from "lucide-react";
import type { PageBlock } from "@lume/types";
import type { EditorBlockDescriptor } from "@lume/blocks";
import {
  describeEdit,
  type DroppedEdit,
  type EditorChatMessage,
  type ProposedEdit,
} from "@/lib/editorCopilot";

/**
 * The editor copilot chat panel, docked in the page editor beside the live
 * preview. It only ever *proposes*: validated edits render as cards with
 * Apply/Discard, and the parent owns the draft state, apply, and undo.
 */

type Proposal = { edits: ProposedEdit[]; dropped: DroppedEdit[] };

type ConciergePanelProps = {
  tenantSlug: string;
  pageSlug: string;
  pageTitle: string;
  version: number;
  blocks: PageBlock[];
  selectedBlockId: string | null;
  descriptors: EditorBlockDescriptor[];
  onApplyEdits: (edits: ProposedEdit[]) => void;
  onUndo: () => void;
  canUndo: boolean;
};

export function ConciergePanel({
  tenantSlug,
  pageSlug,
  pageTitle,
  version,
  blocks,
  selectedBlockId,
  descriptors,
  onApplyEdits,
  onUndo,
  canUndo,
}: ConciergePanelProps) {
  const [messages, setMessages] = useState<EditorChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planLocked, setPlanLocked] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  // The blocks the last proposal was validated against — Apply uses the live
  // array, but labels should describe what the model saw.
  const proposalBlocksRef = useRef<PageBlock[]>([]);

  const descriptorsByType = useMemo(
    () => new Map(descriptors.map((descriptor) => [descriptor.type, descriptor])),
    [descriptors],
  );

  async function send() {
    const content = input.trim();
    if (!content || pending) return;
    const nextMessages: EditorChatMessage[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setProposal(null);
    setPending(true);
    try {
      const response = await fetch("/api/editor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantSlug,
          pageSlug,
          pageTitle,
          draft: { version: version || 1, blocks },
          ...(selectedBlockId ? { selectedBlockId } : {}),
          messages: nextMessages,
        }),
      });
      if (response.status === 403) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        if (payload?.error === "plan_upgrade_required") {
          setPlanLocked(true);
          return;
        }
        setError("You are not authorized to use the concierge for this tenant.");
        return;
      }
      if (response.status === 429) {
        setError("The concierge needs a moment — try again shortly.");
        return;
      }
      if (!response.ok) {
        setError("The editor concierge is temporarily unavailable.");
        return;
      }
      const payload = (await response.json()) as {
        reply: string;
        edits: ProposedEdit[];
        droppedEdits?: DroppedEdit[];
      };
      if (payload.reply) {
        setMessages((current) => [...current, { role: "assistant", content: payload.reply }]);
      }
      if (payload.edits.length > 0 || (payload.droppedEdits?.length ?? 0) > 0) {
        proposalBlocksRef.current = blocks;
        setProposal({ edits: payload.edits, dropped: payload.droppedEdits ?? [] });
      }
    } catch {
      setError("The editor concierge is temporarily unavailable.");
    } finally {
      setPending(false);
    }
  }

  function applyProposal() {
    if (!proposal || proposal.edits.length === 0) return;
    onApplyEdits(proposal.edits);
    setProposal(null);
  }

  if (planLocked) {
    return (
      <section
        aria-label="Concierge"
        className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
      >
        <PanelHeading />
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          The editor concierge is available on Pro and Ultra plans.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="Concierge"
      className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
    >
      <div className="flex items-center justify-between gap-2">
        <PanelHeading />
        {canUndo && (
          <button
            type="button"
            onClick={onUndo}
            className="inline-flex items-center gap-1 rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            <Undo2 className="size-3.5" aria-hidden="true" />
            Undo
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Describe a change — the concierge proposes edits, you apply them.
      </p>

      <div aria-live="polite" className="mt-3 max-h-64 space-y-2 overflow-y-auto">
        {messages.length === 0 && (
          <p className="rounded-lg border border-dashed border-neutral-300 p-3 text-xs text-muted-foreground dark:border-neutral-700">
            Try: &ldquo;Add a testimonials block after the hero&rdquo; or
            &ldquo;Move the finance calculator above the FAQ&rdquo;.
          </p>
        )}
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`rounded-lg px-3 py-2 text-sm ${
              message.role === "user"
                ? "bg-neutral-100 dark:bg-neutral-900"
                : "border border-neutral-200 dark:border-neutral-800"
            }`}
          >
            {message.content}
          </div>
        ))}
        {pending && (
          <p className="text-xs text-muted-foreground" role="status">
            Thinking…
          </p>
        )}
      </div>

      {proposal && (
        <div
          aria-live="polite"
          className="mt-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
        >
          <h3 className="text-xs font-semibold">Proposed edits</h3>
          {proposal.edits.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              No applicable edits in this proposal.
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-xs">
              {proposal.edits.map((edit, index) => (
                <li key={index} className="flex items-start gap-1.5">
                  <span aria-hidden="true">•</span>
                  {describeEdit(edit, proposalBlocksRef.current, descriptorsByType)}
                </li>
              ))}
            </ul>
          )}
          {proposal.dropped.length > 0 && (
            <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
              {proposal.dropped.map((dropped, index) => (
                <li key={index}>Skipped: {dropped.reason}</li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={applyProposal}
              disabled={proposal.edits.length === 0}
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => setProposal(null)}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-xs text-destructive">
          {error}
        </p>
      )}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <label htmlFor="concierge-input" className="sr-only">
          Ask the concierge to edit this page
        </label>
        <input
          id="concierge-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Describe a change…"
          disabled={pending}
          className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          aria-label="Send"
          className="rounded-lg border border-neutral-300 px-3 py-2 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          <Send className="size-4" aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}

function PanelHeading() {
  return (
    <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
      <Sparkles className="size-4" aria-hidden="true" />
      Concierge
    </h2>
  );
}
