"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  streamChat,
  type BotAction,
  type ChatStreamConfig,
  type ChatTransportMessage,
} from "@lume/blocks/chat-transport";
import {
  resolveActionOutcome,
  type ActionNavigation,
} from "../concierge/conciergeActions";
import {
  inAppHistoryFor,
  inAppHistorySummary,
  rewindInAppPath,
} from "../concierge/inAppHistory";
import { tenantHref } from "../concierge/publicPath";
import { queueLeadForm } from "../concierge/pendingLeadForm";
import { queueTargetActivation } from "../concierge/targetActivation";
import { submitPublicLead } from "../concierge/submitLead";
import type { LeadCaptureInput } from "@lume/types";
import {
  recordActionDispatched,
  recordActionSuppressed,
} from "../concierge/conciergeAnalytics";
import "../concierge/concierge.css";

/**
 * Route-scoped concierge. Navigation and conversion actions wait for the turn
 * to finish; aborted/failed turns cannot apply buffered effects.
 */

type Turn = { id: string; role: "user" | "assistant"; content: string };

function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLocal(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode / blocked storage — session continuity degrades gracefully */
  }
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

export default function ChatEntry({
  title,
  vehicleId,
  tenant,
  close,
}: {
  title: string;
  vehicleId: string;
  tenant: string;
  close: () => void;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const session = useRef<string | null>(null);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [thinking, setThinking] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [botName, setBotName] = useState<string | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [leadStatus, setLeadStatus] = useState<string | null>(null);

  const sessionKey = `lume.chat.session.v1.${tenant}`;
  const capsKey = `lume.chat.capabilities.v1.${tenant}`;

  useEffect(() => {
    session.current = readLocal(sessionKey);
    setBotName(readLocal("lume.chat.bot-name.v1"));
    const node = dialog.current;
    node?.showModal();
    return () => {
      controller.current?.abort();
      node?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function config(): ChatStreamConfig {
    const pathname =
      typeof window !== "undefined" ? window.location.pathname : "";
    return {
      tenantSlug: tenant,
      pagePath: pathname,
      navigation: inAppHistorySummary(tenant),
    };
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || streaming) return;

    const userTurn: Turn = { id: newId(), role: "user", content };
    const assistantId = newId();
    const history: ChatTransportMessage[] = [...turns, userTurn].map((t) => ({
      role: t.role,
      content: t.content,
    }));

    setTurns((prev) => [
      ...prev,
      userTurn,
      { id: assistantId, role: "assistant", content: "" },
    ]);
    setDraft("");
    setError(null);
    setLeadStatus(null);
    setStreaming(true);

    const abort = new AbortController();
    controller.current = abort;
    const requestId = newId();
    // The concierge streams actions before prose. Navigating mid-stream would
    // unmount this page-scoped dialog and drop the reply, so we apply the
    // winning navigation once the turn completes; the analytics event is still
    // emitted once per action, as it arrives.
    let pendingNav: ActionNavigation | null = null;
    const captures = new Map<string, LeadCaptureInput>();

    const appendDelta = (textPart: string) =>
      setTurns((prev) =>
        prev.map((t) =>
          t.id === assistantId ? { ...t, content: t.content + textPart } : t,
        ),
      );
    const dropEmptyAssistant = () =>
      setTurns((prev) =>
        prev.filter((t) => !(t.id === assistantId && t.content === "")),
      );

    try {
      for await (const event of streamChat(config(), history, {
        requireCompletion: true,
        signal: abort.signal,
        sessionId: session.current ?? undefined,
        requestId,
      })) {
        switch (event.kind) {
          case "meta":
            setSources(event.sourceCategories);
            if (event.botName) {
              setBotName(event.botName);
              writeLocal("lume.chat.bot-name.v1", event.botName);
            }
            if (event.sessionId) {
              session.current = event.sessionId;
              writeLocal(sessionKey, event.sessionId);
            }
            if (event.capabilities) {
              writeLocal(capsKey, JSON.stringify(event.capabilities));
            }
            break;
          case "delta":
            appendDelta(event.text);
            break;
          case "thinking":
            setThinking(event.text);
            break;
          case "action": {
            if (abort.signal.aborted) {
              recordActionSuppressed(event.action);
              break;
            }
            const outcome = resolveActionOutcome(
              event.action,
              inAppHistoryFor(tenant),
            );
            if (outcome.kind === "ignored")
              recordActionSuppressed(event.action);
            else recordActionDispatched(event.action);
            if (outcome.kind === "navigate") pendingNav = outcome;
            if (outcome.kind === "capture-lead")
              captures.set(JSON.stringify(outcome.input), outcome.input);
            break;
          }
          case "duplicate":
            pendingNav = null;
            captures.clear();
            dropEmptyAssistant();
            break;
          case "timing":
            break;
        }
      }
      for (const input of captures.values()) {
        if (abort.signal.aborted) break;
        setLeadStatus("Sending your details…");
        await submitPublicLead(tenant, input, abort.signal);
        if (!abort.signal.aborted)
          setLeadStatus("Your details were sent to the dealership.");
      }
      if (pendingNav && !abort.signal.aborted) {
        const { href, replace } = pendingNav;
        if (replace) rewindInAppPath(href);
        dialog.current?.close();
        close();
        if (pendingNav.leadForm) queueLeadForm(tenant, pendingNav.leadForm);
        if (pendingNav.target) queueTargetActivation(tenant, pendingNav.target);
        const destination = href.startsWith("#")
          ? window.location.pathname + window.location.search + href
          : href;
        if (replace) router.replace(tenantHref(destination, tenant));
        else router.push(tenantHref(destination, tenant));
      }
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        dropEmptyAssistant();
      } else {
        setLeadStatus(null);
        dropEmptyAssistant();
        setError(
          caught instanceof Error
            ? caught.message
            : "The concierge is unavailable right now.",
        );
      }
    } finally {
      setStreaming(false);
      setThinking("");
      controller.current = null;
    }
  }

  return (
    <dialog
      ref={dialog}
      className="concierge"
      onCancel={close}
      aria-label={`Concierge for ${title}`}
    >
      <div className="concierge__frame">
        <header className="concierge__head">
          <h2>{botName ? `${botName} · ${title}` : `Ask about ${title}`}</h2>
          {sources.length > 0 ? (
            <span className="concierge__source">{sources.join(" · ")}</span>
          ) : null}
        </header>

        <div className="concierge__log" aria-live="polite">
          {turns.length === 0 ? (
            <p className="concierge__turn concierge__turn--assistant">
              Ask about {title} — pricing, specs, availability or a test drive.
            </p>
          ) : null}
          {turns.map((turn) => (
            <p
              key={turn.id}
              className={`concierge__turn concierge__turn--${turn.role}`}
            >
              {turn.content ||
                (streaming && turn.role === "assistant" ? "…" : "")}
            </p>
          ))}
          {thinking ? <p className="concierge__thinking">{thinking}</p> : null}
          {error ? (
            <p className="concierge__error" role="alert">
              {error}
            </p>
          ) : null}
          {leadStatus ? <p role="status">{leadStatus}</p> : null}
        </div>

        <form
          className="concierge__form"
          onSubmit={(event) => {
            event.preventDefault();
            void send(draft);
          }}
        >
          <input
            className="concierge__input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={`Ask about ${title}`}
            aria-label="Message the concierge"
            autoFocus
            disabled={streaming}
          />
          <button
            className="concierge__send"
            type="submit"
            disabled={streaming || draft.trim().length === 0}
          >
            {streaming ? "…" : "Send"}
          </button>
          <button className="concierge__close" type="button" onClick={close}>
            Close
          </button>
        </form>
      </div>
      <span hidden data-vehicle={vehicleId} />
    </dialog>
  );
}
