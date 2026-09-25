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
  /**
   * Client-generated opaque turn id (UUID), stable across retries of the SAME
   * turn. It makes a retried delivery recognisable as a duplicate instead of a
   * second turn, and lets the browser ignore actions from a superseded stream.
   * Never an identity or authorization token; the server falls back to its own
   * id when absent or malformed.
   */
  requestId?: string;
  /**
   * What the browser's same-origin in-app history can do right now. Booleans
   * only — never a path. The server uses them solely to word a back-navigation
   * reply truthfully; the destination is always resolved by the browser.
   */
  navigation?: ChatNavigationContext;
};

export type ChatNavigationContext = {
  /** A page visited earlier in this LUME tab precedes the current one. */
  hasPrevious?: boolean;
  /** An inventory results page precedes the current one. */
  hasResults?: boolean;
};

export type ChatStreamMeta = {
  type: "meta";
  sourceCategories: string[];
  /** Opaque server-issued ID used to retain bounded chat continuity. */
  sessionId?: string;
  /**
   * The turn id this stream belongs to — the client's own when it supplied
   * one, otherwise the server's fallback. Additive: older clients ignore it.
   */
  requestId?: string;
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
