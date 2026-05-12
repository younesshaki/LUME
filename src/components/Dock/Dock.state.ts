import { useUIStore } from "@/lib/ui-state";

export function useDockState() {
  const compareActive = useUIStore((state) => state.comparePanel.active);
  const filterOpen = useUIStore((state) => state.filterDrawer.open);
  const chatOpen = useUIStore((state) => state.chat.open);
  const setDock = useUIStore((state) => state.setDock);

  return {
    shouldAdapt: compareActive || filterOpen || chatOpen,
    setDock,
  };
}
