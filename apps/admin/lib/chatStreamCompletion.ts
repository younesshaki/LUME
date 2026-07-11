/**
 * DeepSeek/OpenAI streaming completion markers. A clean transport EOF alone
 * is not proof that the model finished; callers persist assistant text only
 * after one of these explicit markers appears.
 */
export function isChatStreamCompletionLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === "data: [DONE]") return true;
  if (!trimmed.startsWith("data: ")) return false;

  try {
    const payload = JSON.parse(trimmed.slice(6)) as unknown;
    if (!isRecord(payload) || !Array.isArray(payload.choices)) return false;
    return payload.choices.some((choice) => (
      isRecord(choice) &&
      typeof choice.finish_reason === "string" &&
      choice.finish_reason.length > 0
    ));
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
