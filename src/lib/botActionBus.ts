/**
 * Frontend BotAction bus — SCRUM-123.
 *
 * The chat SSE parser (deepseekService) yields parsed `BotAction` objects. This
 * bus is where those actions land. UI components (inventory panel, router,
 * highlight overlay, lead form) subscribe to the action type(s) they care about
 * and react — so chat logic stays fully decoupled from individual components.
 *
 * Pure TypeScript, no framework dependency. For React components prefer the
 * `useBotAction` hook in `./useBotAction`.
 *
 * Usage:
 *   // somewhere in the inventory panel
 *   const off = botActionBus.on("filter_inventory", (action) => applyFilters(action));
 *   // later: off();
 *
 *   // from the chat stream
 *   botActionBus.publish(action);
 */
import type { BotAction } from "@lume/types";

type ActionType = BotAction["type"];
type ActionOfType<T extends ActionType> = Extract<BotAction, { type: T }>;

export type BotActionHandler<T extends ActionType> = (action: ActionOfType<T>) => void;
export type AnyBotActionHandler = (action: BotAction) => void;

class BotActionBus {
  private handlers = new Map<ActionType, Set<(action: BotAction) => void>>();
  private wildcard = new Set<AnyBotActionHandler>();

  /** Subscribe to one action type. Returns an unsubscribe function. */
  on<T extends ActionType>(type: T, handler: BotActionHandler<T>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    const erased = handler as (action: BotAction) => void;
    set.add(erased);
    return () => {
      set!.delete(erased);
    };
  }

  /** Subscribe to every action regardless of type. Returns an unsubscribe fn. */
  onAny(handler: AnyBotActionHandler): () => void {
    this.wildcard.add(handler);
    return () => {
      this.wildcard.delete(handler);
    };
  }

  /** Dispatch an action to all matching subscribers. Handler errors are
   * isolated so one bad subscriber can't break the others or the chat stream. */
  publish(action: BotAction): void {
    const set = this.handlers.get(action.type);
    if (set) {
      for (const handler of set) safeCall(handler, action);
    }
    for (const handler of this.wildcard) safeCall(handler, action);
  }

  /** Test helper — remove every subscriber. */
  clear(): void {
    this.handlers.clear();
    this.wildcard.clear();
  }
}

function safeCall(handler: (action: BotAction) => void, action: BotAction): void {
  try {
    handler(action);
  } catch (error) {
    console.error(`[botActionBus] handler for "${action.type}" threw:`, error);
  }
}

/** App-wide singleton. */
export const botActionBus = new BotActionBus();
