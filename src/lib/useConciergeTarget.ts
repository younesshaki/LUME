import { useEffect, useRef } from "react";
import type { BotNavigateTargetAction } from "@lume/types";
import { registerConciergeTargetHandler } from "./conciergeTargetRuntime";

/**
 * One-time section wiring: register the # handler used by a target row. New
 * forms/modals can become concierge-aware without adding another action type.
 */
export function useConciergeTarget(
  handlerId: string,
  handler: (action: BotNavigateTargetAction) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(
    () =>
      registerConciergeTargetHandler(handlerId, (action) =>
        handlerRef.current(action),
      ),
    [handlerId],
  );
}
