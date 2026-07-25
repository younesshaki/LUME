"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Bot } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "lume.concierge-robot.enabled";

type ConciergeRobotContextValue = {
  /** Off unless the user has turned it on — the scene is several megabytes. */
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  /** The sidebar's leftover space, when there is one to park in. */
  slot: HTMLElement | null;
  registerSlot: (element: HTMLElement | null) => void;
  /** False while a sidebar group is expanded — its sub-items claim the space. */
  parked: boolean;
};

const ConciergeRobotContext = createContext<ConciergeRobotContextValue>({
  enabled: false,
  setEnabled: () => {},
  slot: null,
  registerSlot: () => {},
  parked: false,
});

export function useConciergeRobot(): ConciergeRobotContextValue {
  return useContext(ConciergeRobotContext);
}

/**
 * Owns whether the concierge head is shown at all, and shares the sidebar's
 * spare space with it.
 *
 * The head is a single fixed-position WebGL canvas — moving it between DOM
 * parents would remount it and reload the scene — so instead the sidebar
 * publishes an empty element here and the head animates itself over the top.
 */
export function ConciergeRobotProvider({
  parked,
  children,
}: {
  parked: boolean;
  children: ReactNode;
}) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // Starts off on every load so the server render and the first client render
  // agree; the stored preference is applied once mounted.
  const [enabled, setEnabledState] = useState(false);

  useEffect(() => {
    setEnabledState(window.localStorage.getItem(STORAGE_KEY) === "true");
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    window.localStorage.setItem(STORAGE_KEY, String(next));
  }, []);

  const value = useMemo<ConciergeRobotContextValue>(
    () => ({ enabled, setEnabled, slot, registerSlot: setSlot, parked }),
    [enabled, setEnabled, slot, parked]
  );

  return (
    <ConciergeRobotContext.Provider value={value}>
      {children}
    </ConciergeRobotContext.Provider>
  );
}

/**
 * Claims whatever vertical space is left between the nav and the account
 * footer. Purely a measuring target — it renders nothing.
 */
export function ConciergeRobotSlot() {
  const { registerSlot } = useConciergeRobot();

  return (
    <div
      ref={registerSlot}
      aria-hidden="true"
      className="pointer-events-none min-h-0 flex-1 group-data-[collapsible=icon]:hidden"
    />
  );
}

/** Header switch for the concierge head. Off by default. */
export function ConciergeRobotToggle({ className }: { className?: string }) {
  const { enabled, setEnabled } = useConciergeRobot();

  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-pressed={enabled}
        aria-label={enabled ? "Hide the 3D concierge" : "Show the 3D concierge"}
        onClick={() => setEnabled(!enabled)}
        className={cn(
          "inline-flex size-7 items-center justify-center rounded-md border bg-background text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-3.5",
          enabled && "bg-muted text-foreground",
          className
        )}
      >
        <Bot />
      </TooltipTrigger>
      <TooltipContent>
        {enabled ? "Hide the 3D concierge" : "Show the 3D concierge"}
      </TooltipContent>
    </Tooltip>
  );
}
