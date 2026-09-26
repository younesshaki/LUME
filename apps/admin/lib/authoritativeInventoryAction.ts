import type { BotAction, BotInventoryFilterAction } from "@lume/types";

/**
 * A verified inventory query is an authoritative server decision, not a
 * suggestion for the prose model. Once the state machine has accepted new
 * filters and the tenant query returned results, the browser must receive the
 * exact matching filter action or it will display stale inventory while chat
 * remembers the new result set.
 *
 * Model-authored filter actions are removed in this situation. They are not
 * allowed to race or disagree with the server-owned query that produced the
 * current conversation state. Other action types remain available for the
 * normal grounding and entitlement pipeline.
 */
export function withAuthoritativeInventoryAction(
  actions: readonly BotAction[],
  authoritative: BotInventoryFilterAction | null,
): BotAction[] {
  if (!authoritative) return [...actions];

  return [
    authoritative,
    ...actions.filter((action) => action.type !== "filter_inventory"),
  ];
}
