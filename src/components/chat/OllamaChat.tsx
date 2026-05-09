import "./OllamaChat.css";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, Copy, Loader2, MessageCircle, RotateCcw, Send, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { getSystemPromptWithContext } from "@/lib/ragService";
import { useSound } from "@/lib/sound";
import { EncryptedText } from "@/components/ui/encrypted-text";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { TypewriterEffect } from "@/components/ui/typewriter-effect";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  sourceCategories?: string[];
};

type OllamaApiMessage = {
  role: ChatRole;
  content: string;
};

type OllamaStreamChunk = {
  message?: { content?: string };
  done?: boolean;
  error?: string;
};

const OLLAMA_CHAT_URL =
  (import.meta.env.VITE_OLLAMA_CHAT_URL as string | undefined) ?? "/ollama/api/chat";

const OLLAMA_MODEL =
  (import.meta.env.VITE_OLLAMA_MODEL as string | undefined) ?? "llama3.1:8b";

const STORAGE_KEY = "lume-chat-v1";

const SUGGESTIONS = [
  "What is LUME?",
  "What products does LUME have?",
  "How do I get access to LUME?",
  "Tell me about the Red Bull collab",
];

const CATEGORY_LABELS: Record<string, string> = {
  brand: "Brand",
  product: "Products",
  experience: "Experience",
  access: "Access",
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
    const parsed = JSON.parse(stored) as ChatMessage[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [welcomeMessage];
  } catch {
    return [welcomeMessage];
  }
}

const panelVariants = {
  hidden: { opacity: 0, scale: 0.94, y: 12 },
  visible: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.94, y: 12 },
};

const toggleVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.9 },
};

const messageVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
};

export function OllamaChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(loadStoredMessages);
  const [isSending, setIsSending] = useState(false);
  const [isRetrieving, setIsRetrieving] = useState(false);
  const [retrievalKey, setRetrievalKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const { play } = useSound();
  const [ratings, setRatings] = useState<Record<string, "up" | "down" | null>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [openSources, setOpenSources] = useState<Record<string, boolean>>({});
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

  // auto-scroll
  useEffect(() => {
    if (!isOpen) return;
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [isOpen, messages, isSending, isRetrieving, error]);

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
    localStorage.removeItem(STORAGE_KEY);
    play("chat.reset");
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
    play("chat.send");

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Phase A: RAG retrieval
    setRetrievalKey((k) => k + 1);
    setIsRetrieving(true);
    let systemPrompt: string;
    let sourceCategories: string[] = [];
    try {
      const result = await getSystemPromptWithContext(trimmedInput, abortController.signal);
      systemPrompt = result.prompt;
      sourceCategories = result.sourceCategories;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      systemPrompt = "You are the LUME assistant. Be concise and helpful.";
    } finally {
      setIsRetrieving(false);
    }

    // Phase B: Streaming Ollama chat
    setIsSending(true);
    const assistantMessageId = createMessage("assistant", "").id;
    streamingMessageIdRef.current = assistantMessageId;
    setMessages((prev) => [
      ...prev,
      { id: assistantMessageId, role: "assistant" as const, content: "", sourceCategories },
    ]);
    play("chat.receive");

    try {
      const response = await fetch(OLLAMA_CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          stream: true,
          messages: [{ role: "system", content: systemPrompt }, ...nextApiMessages],
        }),
        signal: abortController.signal,
      });

      if (!response.ok) throw new Error(`Ollama returned ${response.status} ${response.statusText}`);
      if (!response.body) throw new Error("No response body from Ollama.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let chunk: OllamaStreamChunk;
          try { chunk = JSON.parse(trimmed) as OllamaStreamChunk; } catch { continue; }
          if (chunk.error) throw new Error(chunk.error);
          const token = chunk.message?.content ?? "";
          if (token) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId ? { ...m, content: m.content + token } : m
              )
            );
          }
          if (chunk.done) break outer;
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer.trim()) as OllamaStreamChunk;
          if (chunk.error) throw new Error(chunk.error);
          const token = chunk.message?.content ?? "";
          if (token) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId ? { ...m, content: m.content + token } : m
              )
            );
          }
        } catch { /* ignore */ }
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId ? { ...m, content: m.content.trim() } : m
        )
      );
    } catch (caughtError) {
      if (caughtError instanceof DOMException && caughtError.name === "AbortError") {
        setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));
        return;
      }
      setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));
      const message = caughtError instanceof Error ? caughtError.message : "Unable to reach Ollama.";
      setError(message);
    } finally {
      if (abortControllerRef.current === abortController) abortControllerRef.current = null;
      streamingMessageIdRef.current = null;
      setIsSending(false);
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
    play("chat.suggestion");
    void sendMessage(suggestion);
  };

  const handleCopy = (id: string, content: string) => {
    void navigator.clipboard.writeText(content).then(() => {
      setCopiedId(id);
      play("chat.copy");
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800);
    });
  };

  const handleRate = (id: string, rating: "up" | "down") => {
    setRatings((prev) => ({ ...prev, [id]: prev[id] === rating ? null : rating }));
    play("chat.rate");
  };

  const toggleSources = (id: string) => {
    play("chat.sources.toggle");
    setOpenSources((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const isActive = isSending || isRetrieving;

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
            onMouseEnter={() => play("nav.hover")}
            onClick={() => { play("chat.open"); setIsOpen(true); }}
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
                <strong>LUME</strong>
                <span>{OLLAMA_MODEL}</span>
              </div>
              <div className="ollamaChat__headerActions">
                <button
                  className="ollamaChat__iconButton"
                  type="button"
                  aria-label="Reset chat"
                  title="Reset chat"
                  onMouseEnter={() => play("nav.hover")}
                  onClick={resetChat}
                >
                  <RotateCcw size={17} aria-hidden="true" />
                </button>
                <button
                  className="ollamaChat__iconButton"
                  type="button"
                  aria-label="Close chat"
                  title="Close chat"
                  onMouseEnter={() => play("nav.hover")}
                  onClick={() => { play("chat.close"); setIsOpen(false); }}
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
                    {message.role === "user" ? "You" : "LUME"}
                  </span>
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
                        onMouseEnter={() => play("nav.hover")}
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
                        onMouseEnter={() => play("nav.hover")}
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
                        onMouseEnter={() => play("nav.hover")}
                        onClick={() => handleRate(message.id, "up")}
                      >
                        <ThumbsUp size={13} aria-hidden="true" />
                      </button>
                      <button
                        className={`ollamaChat__actionBtn${ratings[message.id] === "down" ? " ollamaChat__actionBtn--active" : ""}`}
                        type="button"
                        aria-label="Rate response unhelpful"
                        title="Not helpful"
                        onMouseEnter={() => play("nav.hover")}
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
                  <span className="ollamaChat__messageLabel">LUME</span>
                  <span className="ollamaChat__messageText">
                    <EncryptedText
                      key={retrievalKey}
                      text="Searching knowledge base..."
                      revealDelayMs={22}
                      flipDelayMs={35}
                      encryptedClassName="opacity-50"
                    />
                  </span>
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
                    onMouseEnter={() => play("nav.hover")}
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
                onMouseEnter={!input.trim() || isActive ? undefined : () => play("nav.hover")}
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
