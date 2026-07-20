import "server-only";

/**
 * The editor copilot's ONLY model-call seam, now backed by the shared
 * concierge provider abstraction (conciergeModels/chatProviderResolution):
 * the caller passes a plan-validated model id and this resolves the provider
 * url/key/thinking-mode from the environment. If the requested provider is
 * unconfigured, resolution falls back to the cheapest configured model —
 * the route reports the effective model back to the panel.
 *
 * Non-streaming by design — the contract is one structured JSON envelope per
 * turn, not a token stream.
 */
import { buildChatCompletionBody } from "./chatProvider";
import { resolveChatProvider } from "./chatProvider.server";
import type { ConciergeModelId } from "./conciergeModels";

export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };

export type EditorCompletionResult =
  | { ok: true; content: string; modelId: ConciergeModelId; fellBack: boolean }
  | { ok: false; status: number };

export async function requestEditorCopilotCompletion(
  messages: LlmMessage[],
  modelId: ConciergeModelId,
): Promise<EditorCompletionResult> {
  const provider = resolveChatProvider(modelId);
  if (!provider) return { ok: false, status: 503 };

  try {
    const response = await fetch(provider.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify(
        buildChatCompletionBody({
          modelId: provider.profile.id,
          stream: false,
          messages,
          // The system prompt demands a bare JSON envelope; json_object makes
          // the provider enforce it too (extra body fields ride toolFields).
          toolFields: { response_format: { type: "json_object" } },
        }),
      ),
    });
    if (!response.ok) return { ok: false, status: response.status };
    const completion = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = completion.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      return { ok: false, status: 502 };
    }
    return {
      ok: true,
      content,
      modelId: provider.profile.id,
      fellBack: provider.fellBack,
    };
  } catch {
    return { ok: false, status: 502 };
  }
}
