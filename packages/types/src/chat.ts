export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatRequest = {
  /** Conversation history. Server prepends a tenant-scoped system prompt; do not send one from the client. */
  messages: ChatMessage[];
  /** Opaque session ID used only after server ownership validation. */
  sessionId?: string;
  /** Explicitly begins a new browser conversation; retry-safe with sessionId. */
  startNewSession?: boolean;
  /** Untrusted public pathname; the server re-resolves any referenced entity tenant-safely. */
  pagePath?: string;
  stream?: boolean;
};

export type ChatStreamMeta = {
  type: "meta";
  sourceCategories: string[];
  /** Opaque server-issued ID used to retain bounded chat continuity. */
  sessionId?: string;
};

export type ChatStreamError = {
  type: "error";
  message: string;
};

/** Operational activity only; never model reasoning or chain-of-thought. */
export type ChatStreamThinking = {
  type: "thinking";
  text: string;
};
