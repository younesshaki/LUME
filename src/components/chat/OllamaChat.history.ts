import type { ChatRole, OllamaApiMessage } from "./OllamaChat.types";

/**
 * How much conversation the widget sends upstream.
 *
 * The route rejects anything over 30 messages with a 400, and the widget used
 * to post its entire message list. At exchange 16 every send failed and kept
 * failing — not gradual degradation but a wall, unrecoverable without a reset.
 *
 * 20 leaves headroom under the server's 30 and matches MAX_MEMORY_MESSAGES in
 * @lume/bot, which is what the server keeps anyway: sending more than the
 * server will remember is wasted payload. The server cap stays where it is —
 * it guards against a hostile client and must not be raised to accommodate us.
 */
export const MAX_OUTBOUND_MESSAGES = 20;

/**
 * How much conversation survives a refresh.
 *
 * Generous — this is display history, not payload — but bounded. The write is
 * wrapped in a `catch` for quota, which means that once localStorage filled,
 * persistence stopped silently and a long-running visitor lost everything on
 * refresh with no signal that anything had gone wrong.
 */
export const MAX_PERSISTED_MESSAGES = 50;

type RoleBearing = { role: ChatRole };

/**
 * Trim history to the most recent turns, cutting on a turn boundary.
 *
 * Two invariants:
 *
 *  - The final user message always survives. It is the actual question; losing
 *    it to a cap would be worse than the 400 this replaces.
 *  - The window does not begin on a dangling assistant reply. Opening with an
 *    answer whose question was trimmed away reads as context the model should
 *    account for, and invites it to continue a thread the visitor cannot see.
 *
 * Trimming to the boundary can return fewer than `max` messages. That is the
 * intent — a short, coherent window beats a full, incoherent one.
 */
export function trimOutboundHistory<T extends RoleBearing>(
  messages: readonly T[],
  max: number = MAX_OUTBOUND_MESSAGES,
): T[] {
  if (max <= 0) return [];
  if (messages.length <= max) return [...messages];

  const window = messages.slice(-max);

  // Walk forward past any leading assistant turns to land on a user message.
  let start = 0;
  while (start < window.length && window[start].role !== "user") start += 1;

  // All-assistant window: no boundary to cut on, so keep the raw tail rather
  // than sending nothing.
  if (start === window.length) return window;

  return window.slice(start);
}

/** The widget's outbound payload: history trimmed, then the new question. */
export function buildOutboundMessages(
  history: readonly OllamaApiMessage[],
  nextUserContent: string,
  max: number = MAX_OUTBOUND_MESSAGES,
): OllamaApiMessage[] {
  // The new message is appended after trimming and counts against the cap, so
  // the total never exceeds `max`.
  const trimmed = trimOutboundHistory(history, Math.max(0, max - 1));
  return [...trimmed, { role: "user", content: nextUserContent }];
}
