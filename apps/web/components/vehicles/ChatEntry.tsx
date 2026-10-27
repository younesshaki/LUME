"use client";
import { useEffect, useRef, useState } from "react";
import {
  streamChat,
  type BotAction,
  type ChatStreamConfig,
  type ChatTransportMessage,
} from "@lume/blocks/chat-transport";
import "../concierge/concierge.css";

/**
 * Live vehicle concierge (Phase 4a). Streams a turn through the same-origin
 * `/api/chat` proxy, which forwards to the admin app. Text streaming, session
 * continuity, duplicate handling and abort are wired here; action events are
 * validated by the transport and buffered, but acting on them (navigation,
 * filtering, lead prefill) is Phase 4b.
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
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const session = useRef<string | null>(null);
  const actions = useRef<BotAction[]>([]); // buffered for Phase 4b

  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [thinking, setThinking] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [botName, setBotName] = useState<string | null>(null);
  const [sources, setSources] = useState<string[]>([]);

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
      navigation: {
        hasPrevious: false,
        hasResults: pathname.startsWith("/vehicles"),
      },
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
    setStreaming(true);

    const abort = new AbortController();
    controller.current = abort;
    const requestId = newId();

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
          case "action":
            // Validated by the transport; dispatch is Phase 4b.
            actions.current.push(event.action);
            break;
          case "duplicate":
            dropEmptyAssistant();
            break;
          case "timing":
            break;
        }
      }
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        dropEmptyAssistant();
      } else {
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
