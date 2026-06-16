/**
 * React binding for the BotAction bus — SCRUM-123.
 *
 * Subscribes a component to a single BotAction type for its lifetime. The
 * handler is kept in a ref so callers don't need to memoize it; the
 * subscription itself only re-runs when the action type changes.
 *
 *   useBotAction("navigate", (action) => navigate(action.route));
 */
import { useEffect, useRef } from "react";
import type { BotAction } from "@lume/types";
import { botActionBus, type BotActionHandler } from "./botActionBus";

type ActionType = BotAction["type"];

export function useBotAction<T extends ActionType>(
  type: T,
  handler: BotActionHandler<T>
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    return botActionBus.on(type, (action) => handlerRef.current(action));
  }, [type]);
}
