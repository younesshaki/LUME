export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatRequest = {
  /** Conversation history. Server prepends a tenant-scoped system prompt; do not send one from the client. */
  messages: ChatMessage[];
  stream?: boolean;
};

export type ChatStreamMeta = {
  type: "meta";
  sourceCategories: string[];
};

export type ChatStreamError = {
  type: "error";
  message: string;
};
