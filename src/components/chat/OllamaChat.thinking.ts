export const MAX_THINKING_STEPS = 5;
export const MAX_THINKING_TEXT_LENGTH = 120;

export type ThinkingStep = string;
export type ThinkingSteps = readonly ThinkingStep[];

// Strip terminal escapes before generic control characters so fragments such
// as "[31m" are not left visible. Directional/invisible format controls are
// removed as well; normal Unicode text remains intact.
const ANSI_ESCAPE_SEQUENCE = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))/g;
const CONTROL_OR_INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g;

/** Convert an untrusted stream field into a short, single-line display value. */
export function sanitizeThinkingText(value: unknown): ThinkingStep | null {
  if (typeof value !== "string") return null;

  const normalized = value
    .normalize("NFC")
    .replace(ANSI_ESCAPE_SEQUENCE, " ")
    .replace(CONTROL_OR_INVISIBLE, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;

  // Slice code points rather than UTF-16 units so the boundary cannot leave a
  // dangling surrogate when a status contains emoji or non-BMP characters.
  return Array.from(normalized).slice(0, MAX_THINKING_TEXT_LENGTH).join("");
}

/**
 * Append one operational status while retaining the most recent bounded set.
 * Existing state is normalized too, keeping snapshots safe after hydration.
 */
export function appendThinkingStep(
  current: ThinkingSteps,
  incoming: unknown,
): ThinkingStep[] {
  const steps = snapshotThinkingSteps(current);
  const next = sanitizeThinkingText(incoming);
  if (!next) return steps;
  return [...steps, next].slice(-MAX_THINKING_STEPS);
}

/** Return an immutable-by-convention, sanitized copy suitable for a message. */
export function snapshotThinkingSteps(current: ThinkingSteps): ThinkingStep[] {
  const snapshot: ThinkingStep[] = [];
  for (const candidate of current) {
    const step = sanitizeThinkingText(candidate);
    if (!step) continue;
    snapshot.push(step);
  }
  return snapshot.slice(-MAX_THINKING_STEPS);
}
