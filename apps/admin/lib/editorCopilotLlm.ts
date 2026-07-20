import "server-only";

/**
 * The editor copilot's ONLY model-call seam. Deliberately isolated from the
 * visitor-chat pipeline (which is under active model-provider work on another
 * lane): swapping the editor's provider later means editing this one file.
 *
 * Non-streaming by design — the contract is one structured JSON envelope per
 * turn, not a token stream.
 */

export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };

export type EditorCompletionResult =
  | { ok: true; content: string }
  | { ok: false; status: number };

export async function requestEditorCopilotCompletion(
  messages: LlmMessage[],
): Promise<EditorCompletionResult> {
  const url =
    process.env.DEEPSEEK_API_URL ?? "https://api.deepseek.com/v1/chat/completions";
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return { ok: false, status: 500 };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        stream: false,
        // The system prompt demands a bare JSON envelope; json_object makes
        // the provider enforce it too.
        response_format: { type: "json_object" },
        messages,
      }),
    });
    if (!response.ok) return { ok: false, status: response.status };
    const completion = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = completion.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      return { ok: false, status: 502 };
    }
    return { ok: true, content };
  } catch {
    return { ok: false, status: 502 };
  }
}
