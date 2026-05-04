import "./OllamaChat.css";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MessageCircle, RotateCcw, Send, X } from "lucide-react";
import { getSystemPromptWithContext } from "@/lib/ragService";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
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

const welcomeMessage: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "Ask me anything about LUME — our products, philosophy, or how access works.",
};

function createMessage(role: ChatRole, content: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
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

export function OllamaChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(loadStoredMessages);
  const [isSending, setIsSending] = useState(false);
  const [isRetrieving, setIsRetrieving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  useEffect(() => {
    if (!isOpen) return;
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [isOpen, messages, isSending, isRetrieving, error]);

  useEffect(() => {
    return () => abortControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    if (isSending || isRetrieving) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // storage quota exceeded or private mode — silent
    }
  }, [messages, isSending, isRetrieving]);

  const resetChat = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    streamingMessageIdRef.current = null;
    setMessages([welcomeMessage]);
    setInput("");
    setError(null);
    setIsSending(false);
    setIsRetrieving(false);
    localStorage.removeItem(STORAGE_KEY);
  };

  const sendMessage = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isSending || isRetrieving) return;

    const userMessage = createMessage("user", trimmedInput);
    const nextApiMessages: OllamaApiMessage[] = [
      ...apiMessages,
      { role: "user", content: trimmedInput },
    ];

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setError(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Phase A: RAG retrieval
    setIsRetrieving(true);
    let systemPrompt: string;
    try {
      systemPrompt = await getSystemPromptWithContext(trimmedInput, abortController.signal);
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
      { id: assistantMessageId, role: "assistant" as const, content: "" },
    ]);

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

      if (!response.ok) {
        throw new Error(`Ollama returned ${response.status} ${response.statusText}`);
      }
      if (!response.body) {
        throw new Error("No response body from Ollama.");
      }

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
          try {
            chunk = JSON.parse(trimmed) as OllamaStreamChunk;
          } catch {
            continue;
          }
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

      // flush any remaining buffer content
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
        } catch {
          // ignore malformed final buffer
        }
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
      const message =
        caughtError instanceof Error ? caughtError.message : "Unable to reach Ollama.";
      setError(message);
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
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

  const isActive = isSending || isRetrieving;

  if (!isOpen) {
    return (
      <div className="ollamaChat">
        <button
          className="ollamaChat__toggle"
          type="button"
          aria-label="Open LUME assistant"
          title="Open LUME assistant"
          onClick={() => setIsOpen(true)}
        >
          <MessageCircle size={23} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <section className="ollamaChat ollamaChat__panel" aria-label="LUME assistant">
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
            onClick={resetChat}
          >
            <RotateCcw size={17} aria-hidden="true" />
          </button>
          <button
            className="ollamaChat__iconButton"
            type="button"
            aria-label="Close chat"
            title="Close chat"
            onClick={() => setIsOpen(false)}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="ollamaChat__messages" aria-live="polite">
        {messages.map((message) => (
          <article
            className={`ollamaChat__message ollamaChat__message--${message.role}`}
            key={message.id}
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
              {message.content}
            </span>
          </article>
        ))}
        {isRetrieving && (
          <article className="ollamaChat__message ollamaChat__message--assistant">
            <span className="ollamaChat__messageLabel">LUME</span>
            <span className="ollamaChat__messageText">Searching knowledge base…</span>
          </article>
        )}
        {error && <div className="ollamaChat__error">{error}</div>}
        <div ref={messagesEndRef} />
      </div>

      <form className="ollamaChat__composer" onSubmit={handleSubmit}>
        <textarea
          className="ollamaChat__input"
          aria-label="Message LUME assistant"
          placeholder="Message LUME"
          rows={1}
          value={input}
          disabled={isActive}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleInputKeyDown}
        />
        <button
          className="ollamaChat__send"
          type="submit"
          aria-label="Send message"
          title="Send message"
          disabled={!input.trim() || isActive}
        >
          {isActive ? (
            <Loader2 className="ollamaChat__spinner" size={18} aria-hidden="true" />
          ) : (
            <Send size={18} aria-hidden="true" />
          )}
        </button>
      </form>
    </section>
  );
}
