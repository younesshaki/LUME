/**
 * Plan-level gates for /api/chat, driven by the tenant's resolved plan
 * entitlement "chat.actions" (see @lume/types plans catalog).
 *
 * These gates COMPOSE with — never replace — the tenant's own restrictions:
 * a tool or action reaches the visitor only when the plan entitles it AND
 * the tenant config (tool allowlist, persona capabilities) allows it.
 * A Basic tenant gets the informational concierge: it answers questions
 * from the tenant corpus but cannot perform website actions, and a crafted
 * request cannot change that because enforcement happens here, server-side.
 */
import type { BotAction, BotPersonaCapabilities } from "@lume/types";
import { filterBotTools, type AnyBotTool } from "@lume/bot";
import { filterAllowedActions } from "./chatPersona";

/**
 * Persona capabilities forced off when the plan disables action-capable
 * chat. Used for prompt assembly so a Basic concierge is never told about
 * action shapes it may not emit anyway.
 */
export const CHAT_ACTIONS_DISABLED_CAPABILITIES: BotPersonaCapabilities = {
  navigate: false,
  filterInventory: false,
  openLeadForm: false,
  captureLead: false,
  scheduleAppointment: false,
};

/**
 * The plan gate on tools. When chat.actions is off, no tool specs are
 * advertised and `runToolCalls({ allowedToolNames: [] })` refuses any
 * crafted call with tool_not_allowed. When on, the tenant's allowlist
 * decides as before (undefined = legacy all-tools).
 */
export function planEnabledTools(
  chatActionsEnabled: boolean,
  tenantAllowlist: readonly string[] | null | undefined,
): AnyBotTool[] {
  if (!chatActionsEnabled) return [];
  return filterBotTools(tenantAllowlist);
}

/**
 * The plan gate on BotActions from ANY source (model inline JSON, tool
 * results, deterministic navigation). When chat.actions is off every
 * action is dropped — including always-allowed shapes like scroll-to and
 * highlight-vehicle that persona capabilities alone would let through.
 */
export function filterPlanAllowedActions(
  chatActionsEnabled: boolean,
  actions: readonly BotAction[],
  capabilities: BotPersonaCapabilities,
): BotAction[] {
  if (!chatActionsEnabled) return [];
  return filterAllowedActions(actions, capabilities);
}
