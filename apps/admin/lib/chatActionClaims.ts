/**
 * Truthful replies: a model may not claim a site action it did not perform.
 *
 * The confirmed failure was "Done — I've sent you back." with `actions: []`.
 * The prompt already says never to claim navigation without emitting it; this
 * is the enforcement, applied only when a turn emitted NO actions, and only to
 * claims of moving or changing the visitor's page — a textual answer that
 * lists vehicles is not a site action and is left alone.
 */

const SITE_ACTION_CLAIMS: readonly RegExp[] = [
  // "I've sent you back", "I have taken you to the inventory"
  /\b(?:i ve|i have|i)\s+(?:just\s+|now\s+)?(?:sent|taken|brought|navigated|redirected|moved|returned|directed)\s+you\b/,
  // "Taking you there now", "sending you back"
  /\b(?:taking|sending|bringing|navigating|redirecting|returning|moving|directing)\s+you\s+(?:back|there|over|to|straight)\b/,
  // "I've opened the vehicle page", "I pulled up the comparison"
  /\b(?:i ve|i have|i)\s+(?:just\s+|now\s+)?(?:opened|pulled up|brought up|loaded|switched to)\s+(?:the|that|this|your|a|an)\s+(?:[a-z0-9-]+\s+){0,3}(?:page|form|listing|inventory|results|comparison|details|site|screen)\b/,
  // "I've applied the filters", "I have updated your filters"
  /\b(?:i ve|i have)\s+(?:just\s+|now\s+)?(?:applied|set|updated|changed|cleared|reset)\s+(?:the\s+|those\s+|your\s+|these\s+)?filters?\b/,
  // "I've scrolled down to…"
  /\b(?:i ve|i have|i)\s+(?:just\s+)?scrolled\b/,
  // "You're now back on the results page"
  /\byou\s*(?:re| are)\s+now\s+(?:back\s+)?(?:on|at|viewing|looking at)\s+(?:the|your)\b/,
];

export const NO_ACTION_TRUTHFUL_REPLY =
  "I wasn’t able to change the page for you just now. You can use the site’s menu, or tell me what you’d like to see and I’ll find it for you.";

export const NO_ACTION_TRUTHFUL_CORRECTION =
  "\n\nI wasn’t able to change the page for you just now, though — use the site’s menu, or tell me what you’d like to see.";

/** True when the text claims the visitor's page was moved or changed. */
export function claimsCompletedSiteAction(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/\s+/g, " ");
  return SITE_ACTION_CLAIMS.some((pattern) => pattern.test(normalized));
}

/**
 * For a complete reply: keep it unless it claims a site action while none was
 * emitted, in which case the whole reply is replaced — a false claim taints
 * the rest of the text it arrived with.
 */
export function truthfulReplyForEmittedActions(
  text: string,
  emittedActionCount: number,
): { text: string; replaced: boolean } {
  if (emittedActionCount > 0 || !claimsCompletedSiteAction(text)) {
    return { text, replaced: false };
  }
  return { text: NO_ACTION_TRUTHFUL_REPLY, replaced: true };
}
