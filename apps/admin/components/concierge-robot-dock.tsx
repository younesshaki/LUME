"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type DockContextValue = {
  /** The sidebar's leftover space, when there is one to park in. */
  slot: HTMLElement | null;
  registerSlot: (element: HTMLElement | null) => void;
  /** False while a sidebar group is expanded — its sub-items claim the space. */
  parked: boolean;
};

const DockContext = createContext<DockContextValue>({
  slot: null,
  registerSlot: () => {},
  parked: false,
});

export function useConciergeRobotDock(): DockContextValue {
  return useContext(DockContext);
}

/**
 * Shares the sidebar's spare space with the concierge head.
 *
 * The head is a single fixed-position WebGL canvas — moving it between DOM
 * parents would remount it and reload the scene — so instead the sidebar
 * publishes an empty element here and the head animates itself over the top.
 */
export function ConciergeRobotDockProvider({
  parked,
  children,
}: {
  parked: boolean;
  children: ReactNode;
}) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const value = useMemo<DockContextValue>(
    () => ({ slot, registerSlot: setSlot, parked }),
    [slot, parked]
  );

  return <DockContext.Provider value={value}>{children}</DockContext.Provider>;
}

/**
 * Claims whatever vertical space is left between the nav and the account
 * footer. Purely a measuring target — it renders nothing.
 */
export function ConciergeRobotSlot() {
  const { registerSlot } = useConciergeRobotDock();

  return (
    <div
      ref={registerSlot}
      aria-hidden="true"
      className="pointer-events-none min-h-0 flex-1 group-data-[collapsible=icon]:hidden"
    />
  );
}
