import "./OllamaChat.css";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, Copy, Loader2, MessageCircle, RotateCcw, Send, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { streamChat, type DeepseekMessage } from "@/lib/deepseekService";
import { publicTenantSlug } from "@/lib/publicTenant";
import { botActionBus } from "@/lib/botActionBus";
import { EncryptedText } from "@/components/ui/encrypted-text";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { TypewriterEffect } from "@/components/ui/typewriter-effect";
import { messageVariants, panelVariants, toggleVariants } from "./OllamaChat.animations";
import { chatSounds } from "./OllamaChat.sounds";
import { useOllamaChatStateBridge } from "./OllamaChat.state";
import { sanitizeStoredChatMessages } from "./OllamaChat.storage";
import {
  appendThinkingStep,
  snapshotThinkingSteps,
  type ThinkingSteps,
} from "./OllamaChat.thinking";
import type { ChatMessage, ChatRole, OllamaApiMessage } from "./OllamaChat.types";

const STORAGE_KEY = "lume-chat-v1";
const BOT_NAME_STORAGE_KEY = "lume.chat.bot-name.v1";
const CHAT_SESSION_STORAGE_KEY = `lume.chat.session.v1.${publicTenantSlug}`;

const SUGGESTIONS = [
  "What is LUME?",
  "What products does LUME have?",
  "Do you have any Ferraris?",
  "How do I get access to LUME?",
];

const CATEGORY_LABELS: Record<string, string> = {
  brand: "Brand",
  product: "Products",
  experience: "Experience",
  access: "Access",
  vehicles: "Vehicles",
};

const welcomeMessage: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "Ask me anything about LUME — our products, philosophy, or how access works.",
};

const WELCOME_WORDS = welcomeMessage.content
  .split(" ")
  .map((text) => ({ text }));

// module-level flag — typewriter plays once per session
let welcomeHasAnimated = false;

function createMessage(role: ChatRole, content: string, sourceCategories?: string[]): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    sourceCategories,
  };
}

function loadStoredMessages(): ChatMessage[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [welcomeMessage];
    const parsed = sanitizeStoredChatMessages(JSON.parse(stored) as unknown);
    return parsed.length > 0 ? parsed : [welcomeMessage];
  } catch {
    return [welcomeMessage];
  }
}

export function OllamaChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(loadStoredMessages);
  const [isSending, setIsSending] = useState(false);
  const [isRetrieving, setIsRetrieving] = useState(false);
  const [retrievalKey, setRetrievalKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ratings, setRatings] = useState<Record<string, "up" | "down" | null>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [openSources, setOpenSources] = useState<Record<string, boolean>>({});
  const [pendingThinkingSteps, setPendingThinkingSteps] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CHAT_SESSION_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [startNewSession, setStartNewSession] = useState(false);
  // Persona display name; served in the chat stream's meta event so each
  // tenant's configured bot identity shows without a client rebuild.
  const [botName, setBotName] = useState(() => {
    try {
      return localStorage.getItem(BOT_NAME_STORAGE_KEY) ?? "LUME";
    } catch {
      return "LUME";
    }
  });
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);

  const apiMessages = useMemo<OllamaApiMessage[]>(
    () =>
      messages
        .filter((m) => m.id !== welcomeMessage.id)
        .map((m) => ({ role: m.role, content: m.content })),
    [messages]
  );

  const hasUserMessages = messages.some((m) => m.role === "user");
  const isActive = isSending || isRetrieving;

  useOllamaChatStateBridge(isOpen, isActive);

  // auto-scroll
  useEffect(() => {
    if (!isOpen) return;
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [isOpen, messages, isSending, isRetrieving, pendingThinkingSteps, error]);

  // cleanup on unmount
  useEffect(() => {
    return () => abortControllerRef.current?.abort();
  }, []);

  // persist chat (skip during active stream to avoid partial messages)
  useEffect(() => {
    if (isSending || isRetrieving) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // quota exceeded or private mode
    }
  }, [messages, isSending, isRetrieving]);

  // mark typewriter as done after it finishes
  useEffect(() => {
    if (!isOpen || welcomeHasAnimated) return;
    const ms = WELCOME_WORDS.reduce((acc, w) => acc + w.text.length, 0) * 25 + 800;
    const t = setTimeout(() => { welcomeHasAnimated = true; }, ms);
    return () => clearTimeout(t);
  }, [isOpen]);

  const resetChat = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    streamingMessageIdRef.current = null;
    setMessages([welcomeMessage]);
    setInput("");
    setError(null);
    setIsSending(false);
    setIsRetrieving(false);
    setRatings({});
    setCopiedId(null);
    setOpenSources({});
    setPendingThinkingSteps([]);
    localStorage.removeItem(STORAGE_KEY);
    const nextSessionId = createChatSessionId();
    setSessionId(nextSessionId);
    setStartNewSession(true);
    try {
      if (nextSessionId) localStorage.setItem(CHAT_SESSION_STORAGE_KEY, nextSessionId);
      else localStorage.removeItem(CHAT_SESSION_STORAGE_KEY);
    } catch {
      // quota exceeded or private mode
    }
    chatSounds.reset();
  };

  const sendMessage = async (overrideText?: string) => {
    const text = overrideText ?? input;
    const trimmedInput = text.trim();
    if (!trimmedInput || isSending || isRetrieving) return;

    const userMessage = createMessage("user", trimmedInput);
    const nextApiMessages: OllamaApiMessage[] = [
      ...apiMessages,
      { role: "user", content: trimmedInput },
    ];

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setError(null);
    setPendingThinkingSteps([]);
    chatSounds.send();

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // The server handles RAG retrieval and prompt assembly. We show
    // `isRetrieving` until the first chunk arrives (meta or content).
    setRetrievalKey((k) => k + 1);
    setIsRetrieving(true);

    const assistantMessageId = createMessage("assistant", "").id;
    streamingMessageIdRef.current = assistantMessageId;
    let sourceCategories: string[] = [];
    let assistantInserted = false;
    let turnThinkingSteps: string[] = [];

    try {
      const messages: DeepseekMessage[] = nextApiMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      for await (const event of streamChat(
        messages,
        abortController.signal,
        sessionId ?? undefined,
        startNewSession,
      )) {
        if (event.kind === "meta") {
          sourceCategories = event.sourceCategories;
          setStartNewSession(false);
          if (event.sessionId && event.sessionId !== sessionId) {
            setSessionId(event.sessionId);
            try {
              localStorage.setItem(CHAT_SESSION_STORAGE_KEY, event.sessionId);
            } catch {
              // quota exceeded or private mode
            }
          }
          if (event.botName && event.botName !== botName) {
            setBotName(event.botName);
            try {
              localStorage.setItem(BOT_NAME_STORAGE_KEY, event.botName);
            } catch {
              // quota exceeded or private mode
            }
          }
          continue;
        }
        if (event.kind === "action") {
          // Hand the action to the bus; subscribed UI (router, inventory,
          // highlight overlay, lead form) reacts. Chat stays decoupled.
          botActionBus.publish(event.action);
          continue;
        }
        if (event.kind === "thinking") {
          turnThinkingSteps = appendThinkingStep(turnThinkingSteps, event.text);
          setPendingThinkingSteps(turnThinkingSteps);
          continue;
        }
        if (event.kind === "delta") {
          if (!assistantInserted) {
            setIsRetrieving(false);
            setIsSending(true);
            chatSounds.receive();
            setMessages((prev) => [
              ...prev,
              {
                id: assistantMessageId,
                role: "assistant" as const,
                content: event.text,
                sourceCategories,
                thinkingSteps: snapshotThinkingSteps(turnThinkingSteps),
              },
            ]);
            assistantInserted = true;
          } else {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: m.content + event.text, sourceCategories }
                  : m
              )
            );
          }
        }
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? { ...m, content: m.content.trim(), sourceCategories }
            : m
        )
      );
    } catch (caughtError) {
      if (caughtError instanceof DOMException && caughtError.name === "AbortError") {
        setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));
        return;
      }
      setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));
      const message = caughtError instanceof Error ? caughtError.message : "Unable to reach chat API.";
      setError(message);
    } finally {
      if (abortControllerRef.current === abortController) abortControllerRef.current = null;
      streamingMessageIdRef.current = null;
      setIsRetrieving(false);
      setIsSending(false);
      setPendingThinkingSteps([]);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage();
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void sendMessage();
  };

  const handleSuggestion = (suggestion: string) => {
    chatSounds.suggestion();
    void sendMessage(suggestion);
  };

  const handleCopy = (id: string, content: string) => {
    void navigator.clipboard.writeText(content).then(() => {
      setCopiedId(id);
      chatSounds.copy();
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800);
    });
  };

  const handleRate = (id: string, rating: "up" | "down") => {
    setRatings((prev) => ({ ...prev, [id]: prev[id] === rating ? null : rating }));
    chatSounds.rate();
  };

  const toggleSources = (id: string) => {
    chatSounds.toggleSources();
    setOpenSources((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="ollamaChat">
      <AnimatePresence mode="wait">
        {!isOpen ? (
          <motion.button
            key="toggle"
            className="ollamaChat__toggle"
            type="button"
            aria-label="Open LUME assistant"
            title="Open LUME assistant"
            variants={toggleVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ duration: 0.15 }}
            onMouseEnter={chatSounds.hover}
            onClick={() => { chatSounds.open(); setIsOpen(true); }}
          >
            <MessageCircle size={23} aria-hidden="true" />
          </motion.button>
        ) : (
          <motion.section
            key="panel"
            className="ollamaChat__panel"
            aria-label="LUME assistant"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {/* Gold glowing border effect */}
            <GlowingEffect disabled={false} spread={35} borderWidth={1} proximity={80} movementDuration={1.5} />

            <header className="ollamaChat__header">
              <div className="ollamaChat__title">
                <strong>{botName}</strong>
                <span>Assistant</span>
              </div>
              <div className="ollamaChat__headerActions">
                <button
                  className="ollamaChat__iconButton"
                  type="button"
                  aria-label="Reset chat"
                  title="Reset chat"
                  onMouseEnter={chatSounds.hover}
                  onClick={resetChat}
                >
                  <RotateCcw size={17} aria-hidden="true" />
                </button>
                <button
                  className="ollamaChat__iconButton"
                  type="button"
                  aria-label="Close chat"
                  title="Close chat"
                  onMouseEnter={chatSounds.hover}
                  onClick={() => { chatSounds.close(); setIsOpen(false); }}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            </header>

            <div className="ollamaChat__messages" aria-live="polite">
              {messages.map((message) => (
                <motion.article
                  className={`ollamaChat__message ollamaChat__message--${message.role}`}
                  key={message.id}
                  variants={messageVariants}
                  initial="hidden"
                  animate="visible"
                  transition={{ duration: 0.2 }}
                >
                  <span className="ollamaChat__messageLabel">
                    {message.role === "user" ? "You" : botName}
                  </span>
                  {message.role === "assistant" && (
                    <ThinkingActivity
                      steps={Array.isArray(message.thinkingSteps) ? message.thinkingSteps : []}
                    />
                  )}
                  <span
                    className={`ollamaChat__messageText${
                      isSending && message.id === streamingMessageIdRef.current && message.content
                        ? " ollamaChat__streamingCursor"
                        : ""
                    }`}
                  >
                    {message.id === welcomeMessage.id && !welcomeHasAnimated ? (
                      <TypewriterEffect
                        words={WELCOME_WORDS}
                        className="text-[0.9rem] leading-[1.45]"
                        cursorClassName="opacity-60"
                      />
                    ) : (
                      message.content
                    )}
                  </span>

                  {/* Sources — shown under completed assistant messages with RAG context */}
                  {message.role === "assistant" &&
                    message.id !== welcomeMessage.id &&
                    message.id !== streamingMessageIdRef.current &&
                    message.content &&
                    message.sourceCategories &&
                    message.sourceCategories.length > 0 && (
                    <div className="ollamaChat__sources">
                      <button
                        className="ollamaChat__sourcesTrigger"
                        type="button"
                        onMouseEnter={chatSounds.hover}
                        onClick={() => toggleSources(message.id)}
                        aria-expanded={!!openSources[message.id]}
                      >
                        <span>Used {message.sourceCategories.length} source{message.sourceCategories.length !== 1 ? "s" : ""}</span>
                        <ChevronDown
                          size={11}
                          className={`ollamaChat__sourcesChevron${openSources[message.id] ? " ollamaChat__sourcesChevron--open" : ""}`}
                          aria-hidden="true"
                        />
                      </button>
                      {openSources[message.id] && (
                        <div className="ollamaChat__sourcesContent">
                          {message.sourceCategories.map((cat) => (
                            <span key={cat} className="ollamaChat__sourceTag">
                              {CATEGORY_LABELS[cat] ?? cat}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions — copy + rate, shown on completed assistant messages */}
                  {message.role === "assistant" &&
                    message.id !== welcomeMessage.id &&
                    message.id !== streamingMessageIdRef.current &&
                    message.content && (
                    <div className="ollamaChat__actions">
                      <button
                        className="ollamaChat__actionBtn"
                        type="button"
                        aria-label="Copy message"
                        title="Copy"
                        onMouseEnter={chatSounds.hover}
                        onClick={() => handleCopy(message.id, message.content)}
                      >
                        {copiedId === message.id ? (
                          <Check size={13} aria-hidden="true" />
                        ) : (
                          <Copy size={13} aria-hidden="true" />
                        )}
                      </button>
                      <button
                        className={`ollamaChat__actionBtn${ratings[message.id] === "up" ? " ollamaChat__actionBtn--active" : ""}`}
                        type="button"
                        aria-label="Rate response helpful"
                        title="Helpful"
                        onMouseEnter={chatSounds.hover}
                        onClick={() => handleRate(message.id, "up")}
                      >
                        <ThumbsUp size={13} aria-hidden="true" />
                      </button>
                      <button
                        className={`ollamaChat__actionBtn${ratings[message.id] === "down" ? " ollamaChat__actionBtn--active" : ""}`}
                        type="button"
                        aria-label="Rate response unhelpful"
                        title="Not helpful"
                        onMouseEnter={chatSounds.hover}
                        onClick={() => handleRate(message.id, "down")}
                      >
                        <ThumbsDown size={13} aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </motion.article>
              ))}

              {isRetrieving && (
                <motion.article
                  className="ollamaChat__message ollamaChat__message--assistant"
                  variants={messageVariants}
                  initial="hidden"
                  animate="visible"
                  transition={{ duration: 0.2 }}
                >
                  <span className="ollamaChat__messageLabel">{botName}</span>
                  {pendingThinkingSteps.length > 0 ? (
                    <ThinkingActivity steps={pendingThinkingSteps} pending />
                  ) : (
                    <span className="ollamaChat__messageText">
                      <EncryptedText
                        key={retrievalKey}
                        text="Searching knowledge base..."
                        revealDelayMs={22}
                        flipDelayMs={35}
                        encryptedClassName="opacity-50"
                      />
                    </span>
                  )}
                </motion.article>
              )}

              {error && <div className="ollamaChat__error">{error}</div>}
              <div ref={messagesEndRef} />
            </div>

            {/* Suggestions — shown before first user message */}
            {!hasUserMessages && !isActive && (
              <div className="ollamaChat__suggestions">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    className="ollamaChat__suggestion"
                    type="button"
                    onMouseEnter={chatSounds.hover}
                    onClick={() => handleSuggestion(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <form className="ollamaChat__composer" onSubmit={handleSubmit}>
              <textarea
                className="ollamaChat__input"
                aria-label="Message LUME assistant"
                placeholder="Message LUME"
                rows={1}
                value={input}
                disabled={isActive}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleInputKeyDown}
              />
              <button
                className="ollamaChat__send"
                type="submit"
                aria-label="Send message"
                title="Send message"
                disabled={!input.trim() || isActive}
                onMouseEnter={!input.trim() || isActive ? undefined : chatSounds.hover}
              >
                {isActive ? (
                  <Loader2 className="ollamaChat__spinner" size={18} aria-hidden="true" />
                ) : (
                  <Send size={18} aria-hidden="true" />
                )}
              </button>
            </form>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

function ThinkingActivity({
  steps,
  pending = false,
}: {
  steps: ThinkingSteps;
  pending?: boolean;
}) {
  const visibleSteps = snapshotThinkingSteps(steps);
  if (visibleSteps.length === 0) return null;

  return (
    <ol
      className={`ollamaChat__thinking${pending ? " ollamaChat__thinking--pending" : ""}`}
      aria-label="Assistant activity"
    >
      {visibleSteps.map((step, index) => (
        <li key={`${index}-${step}`}>
          <span className="ollamaChat__thinkingDot" aria-hidden="true" />
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

function createChatSessionId(): string | null {
  try {
    return globalThis.crypto?.randomUUID?.() ?? null;
  } catch {
    return null;
  }
}
