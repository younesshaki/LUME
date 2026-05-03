import "./OllamaChat.css";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MessageCircle, RotateCcw, Send, X } from "lucide-react";

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

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
  error?: string;
};

const OLLAMA_CHAT_URL =
  (import.meta.env.VITE_OLLAMA_CHAT_URL as string | undefined) ?? "/ollama/api/chat";

const OLLAMA_MODEL =
  (import.meta.env.VITE_OLLAMA_MODEL as string | undefined) ?? "llama3.1:8b";

const SYSTEM_PROMPT =
  "You are LUME's local assistant. Be concise, helpful, and clear. If you do not know something, say so.";

const welcomeMessage: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "Ask me anything about LUME. I am running through your local llama3.1:8b model.",
};

function createMessage(role: ChatRole, content: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
  };
}

export function OllamaChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const apiMessages = useMemo<OllamaApiMessage[]>(
    () =>
      messages
        .filter((message) => message.id !== welcomeMessage.id)
        .map((message) => ({
          role: message.role,
          content: message.content,
        })),
    [messages]
  );

  useEffect(() => {
    if (!isOpen) return;
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [isOpen, messages, isSending, error]);

  useEffect(() => {
    return () => abortControllerRef.current?.abort();
  }, []);

  const resetChat = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setMessages([welcomeMessage]);
    setInput("");
    setError(null);
    setIsSending(false);
  };

  const sendMessage = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isSending) return;

    const userMessage = createMessage("user", trimmedInput);
    const nextApiMessages: OllamaApiMessage[] = [
      ...apiMessages,
      { role: "user", content: trimmedInput },
    ];

    setMessages((currentMessages) => [...currentMessages, userMessage]);
    setInput("");
    setError(null);
    setIsSending(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch(OLLAMA_CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          stream: false,
          messages: [
            {
              role: "system",
              content: SYSTEM_PROMPT,
            },
            ...nextApiMessages,
          ],
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Ollama returned ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as OllamaChatResponse;
      const assistantContent = data.message?.content?.trim();

      if (data.error) {
        throw new Error(data.error);
      }

      if (!assistantContent) {
        throw new Error("Ollama returned an empty response.");
      }

      setMessages((currentMessages) => [
        ...currentMessages,
        createMessage("assistant", assistantContent),
      ]);
    } catch (caughtError) {
      if (caughtError instanceof DOMException && caughtError.name === "AbortError") return;
      const message = caughtError instanceof Error ? caughtError.message : "Unable to reach Ollama.";
      setError(message);
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
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

  if (!isOpen) {
    return (
      <div className="ollamaChat">
        <button
          className="ollamaChat__toggle"
          type="button"
          aria-label="Open local AI chat"
          title="Open local AI chat"
          onClick={() => setIsOpen(true)}
        >
          <MessageCircle size={23} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <section className="ollamaChat ollamaChat__panel" aria-label="Local AI chat">
      <header className="ollamaChat__header">
        <div className="ollamaChat__title">
          <strong>Local AI</strong>
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
              {message.role === "user" ? "You" : "Llama"}
            </span>
            <span className="ollamaChat__messageText">{message.content}</span>
          </article>
        ))}
        {isSending && (
          <article className="ollamaChat__message ollamaChat__message--assistant">
            <span className="ollamaChat__messageLabel">Llama</span>
            <span className="ollamaChat__messageText">Thinking...</span>
          </article>
        )}
        {error && <div className="ollamaChat__error">{error}</div>}
        <div ref={messagesEndRef} />
      </div>

      <form className="ollamaChat__composer" onSubmit={handleSubmit}>
        <textarea
          className="ollamaChat__input"
          aria-label="Message local AI"
          placeholder="Message local AI"
          rows={1}
          value={input}
          disabled={isSending}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleInputKeyDown}
        />
        <button
          className="ollamaChat__send"
          type="submit"
          aria-label="Send message"
          title="Send message"
          disabled={!input.trim() || isSending}
        >
          {isSending ? (
            <Loader2 className="ollamaChat__spinner" size={18} aria-hidden="true" />
          ) : (
            <Send size={18} aria-hidden="true" />
          )}
        </button>
      </form>
    </section>
  );
}
