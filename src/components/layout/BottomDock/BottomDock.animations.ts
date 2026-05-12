import { useUIStore } from "@/lib/ui-state";

export function useBottomDockLayoutState() {
  const chatOpen = useUIStore((state) => state.chat.open);
  const filterOpen = useUIStore((state) => state.filterDrawer.open);
  const compareActive = useUIStore((state) => state.comparePanel.active);

  return {
    isCompetingWithOverlay: chatOpen || filterOpen || compareActive,
  };
}
