/**
 * Deepseek API chat inference service with streaming support.
 * Replaces Ollama for faster, more reliable responses.
 */

const DEEPSEEK_API_URL =
  (import.meta.env.VITE_DEEPSEEK_API_URL as string | undefined) ??
  (import.meta.env.DEV ? "/deepseek-api/v1/chat/completions" : "/api/deepseek-proxy");

export type DeepseekMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type DeepseekStreamChunk = {
  choices?: Array<{
    delta?: {
      content?: string;
    };
    finish_reason?: string | null;
  }>;
  error?: string;
};

/**
 * Stream a chat completion from Deepseek.
 * Yields partial content strings as they arrive.
 * Throws on network errors or API errors.
 */
export async function* streamDeepseekChat(
  messages: DeepseekMessage[],
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    let errorBody = "";
    try {
      errorBody = await response.text();
    } catch {
      // ignore
    }
    throw new Error(
      `Deepseek API error: ${response.status} ${response.statusText}${
        errorBody ? ` - ${errorBody}` : ""
      }`
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Deepseek API response body is not readable");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed === "data: [DONE]") {
          return;
        }
        if (trimmed.startsWith("data: ")) {
          const jsonStr = trimmed.slice(6);
          try {
            const chunk: DeepseekStreamChunk = JSON.parse(jsonStr);
            if (chunk.error) {
              throw new Error(`Deepseek API error: ${chunk.error}`);
            }
            const content = chunk.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch (parseErr) {
            console.warn("[deepseek] Failed to parse chunk:", jsonStr, parseErr);
          }
        }
      }
    }

    buffer += decoder.decode();
    const trimmed = buffer.trim();
    if (trimmed && trimmed.startsWith("data: ")) {
      const jsonStr = trimmed.slice(6);
      try {
        const chunk: DeepseekStreamChunk = JSON.parse(jsonStr);
        if (chunk.error) {
          throw new Error(`Deepseek API error: ${chunk.error}`);
        }
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) {
          yield content;
        }
      } catch (parseErr) {
        console.warn("[deepseek] Failed to parse final chunk:", jsonStr, parseErr);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Non-streaming convenience function.
 * Returns the full response content as a string.
 */
export async function deepseekChat(
  messages: DeepseekMessage[],
  signal?: AbortSignal
): Promise<string> {
  let fullContent = "";
  for await (const chunk of streamDeepseekChat(messages, signal)) {
    fullContent += chunk;
  }
  return fullContent;
}
