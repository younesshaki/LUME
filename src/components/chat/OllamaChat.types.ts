export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  sourceCategories?: string[];
};

export type OllamaApiMessage = {
  role: ChatRole;
  content: string;
};

export type OllamaStreamChunk = {
  message?: { content?: string };
  done?: boolean;
  error?: string;
};
