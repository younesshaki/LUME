"use client";

import { useMemo, useRef, useState } from "react";
import { LockKeyhole, Send, Sparkles, Undo2 } from "lucide-react";
import type { PageBlock } from "@lume/types";
import type { EditorBlockDescriptor } from "@lume/blocks";
import { Slider } from "@/components/ui/slider";
import {
  CONCIERGE_MODEL_PROFILES,
  DEFAULT_CONCIERGE_MODEL_ID,
  conciergeModelIndex,
  isProviderAvailable,
  type ConciergeModelId,
  type ConciergeProvider,
} from "@/lib/conciergeModels";
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
 *
 * The intelligence selector mirrors the visitor concierge's slider. Premium
 * levels (anything above the base model) are Pro/Ultra: on Basic, selecting
 * one opens an upgrade dialog instead — and the route re-enforces the same
 * gate server-side, so the panel state is never the authority.
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
  premiumModelsEnabled: boolean;
  providerAvailability: Readonly<Record<ConciergeProvider, boolean>>;
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
  premiumModelsEnabled,
  providerAvailability,
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
  const [modelId, setModelId] = useState<ConciergeModelId>(DEFAULT_CONCIERGE_MODEL_ID);
  const [upgradeModel, setUpgradeModel] = useState<string | null>(null);
  // The blocks the last proposal was validated against — Apply uses the live
  // array, but labels should describe what the model saw.
  const proposalBlocksRef = useRef<PageBlock[]>([]);

  const descriptorsByType = useMemo(
    () => new Map(descriptors.map((descriptor) => [descriptor.type, descriptor])),
    [descriptors],
  );
  const selectedIndex = conciergeModelIndex(modelId);
  const selectedProfile = CONCIERGE_MODEL_PROFILES[selectedIndex];

  /** Premium levels open the upgrade dialog on Basic instead of selecting. */
  function selectLevel(index: number) {
    const profile = CONCIERGE_MODEL_PROFILES[
      Math.max(0, Math.min(index, CONCIERGE_MODEL_PROFILES.length - 1))
    ];
    if (profile.premium && !premiumModelsEnabled) {
      setUpgradeModel(`${profile.providerLabel} ${profile.modelLabel}`);
      return;
    }
    if (!isProviderAvailable(profile.id, providerAvailability)) return;
    setModelId(profile.id);
  }

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
          modelId,
          messages: nextMessages,
        }),
      });
      if (response.status === 403) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; feature?: string }
          | null;
        if (payload?.error === "plan_upgrade_required") {
          if (payload.feature === "chat.premium_models") {
            setUpgradeModel(`${selectedProfile.providerLabel} ${selectedProfile.modelLabel}`);
            setModelId(DEFAULT_CONCIERGE_MODEL_ID);
          } else {
            setPlanLocked(true);
          }
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
        model?: { id: string; fellBack: boolean };
      };
      if (payload.model?.fellBack) {
        setError("The selected model's provider is unavailable; a fallback model answered.");
      }
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

      <div className="mt-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Intelligence
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium">
            <img
              src={selectedProfile.iconSrc}
              alt=""
              aria-hidden="true"
              className="size-4 object-contain"
            />
            {selectedProfile.providerLabel} {selectedProfile.modelLabel}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between">
          {CONCIERGE_MODEL_PROFILES.map((profile, index) => {
            const locked = profile.premium && !premiumModelsEnabled;
            const unavailable = !isProviderAvailable(profile.id, providerAvailability);
            const isSelected = index === selectedIndex;
            return (
              <button
                key={profile.id}
                type="button"
                onClick={() => selectLevel(index)}
                disabled={!locked && unavailable}
                aria-pressed={isSelected}
                aria-label={`Level ${index + 1}: ${profile.providerLabel} ${profile.modelLabel}${locked ? " (Pro and Ultra plans)" : unavailable ? " (not configured)" : ""}`}
                title={
                  locked
                    ? "Available on Pro and Ultra plans"
                    : unavailable
                      ? `${profile.providerLabel} is not configured in this environment`
                      : `${profile.providerLabel} ${profile.modelLabel}`
                }
                className={`relative flex size-9 items-center justify-center rounded-lg border bg-white p-1.5 transition-all disabled:opacity-40 ${
                  isSelected
                    ? "border-neutral-900 ring-2 ring-neutral-900/15 dark:border-white"
                    : "border-neutral-200 hover:border-neutral-400 dark:border-neutral-700"
                }`}
              >
                <img
                  src={profile.iconSrc}
                  alt=""
                  aria-hidden="true"
                  className="max-h-full max-w-full object-contain"
                />
                {(locked || unavailable) && (
                  <span className="absolute -right-1 -top-1 flex size-3.5 items-center justify-center rounded-full bg-neutral-200 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                    <LockKeyhole className="size-2" aria-hidden="true" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <Slider
          className="mt-3"
          min={0}
          max={CONCIERGE_MODEL_PROFILES.length - 1}
          step={1}
          value={[selectedIndex]}
          onValueChange={(values) => selectLevel(values[0] ?? 0)}
          aria-label="Editor concierge intelligence level"
          aria-valuetext={`Level ${selectedIndex + 1}: ${selectedProfile.providerLabel} ${selectedProfile.modelLabel}`}
        />
      </div>

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

      {upgradeModel && (
        <UpgradeDialog modelLabel={upgradeModel} onClose={() => setUpgradeModel(null)} />
      )}
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

/** The "slide to Kimi on Basic" popup: upgrade to unlock premium models. */
function UpgradeDialog({
  modelLabel,
  onClose,
}: {
  modelLabel: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-dialog-title"
        className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-800 dark:bg-neutral-950"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="upgrade-dialog-title" className="inline-flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4" aria-hidden="true" />
          Unlock deeper intelligence
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {modelLabel} is available on the Pro and Ultra plans. Upgrade to give
          your concierge more capable reasoning.
        </p>
        <div className="mt-4 flex gap-2">
          <a
            href="/login"
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            View plans
          </a>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
