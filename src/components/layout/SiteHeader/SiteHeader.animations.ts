import { useUIStore } from "@/lib/ui-state";

export function useSiteHeaderLayoutState() {
  const chatOpen = useUIStore((state) => state.chat.open);
  const filterOpen = useUIStore((state) => state.filterDrawer.open);

  return {
    hasOverlayPressure: chatOpen || filterOpen,
  };
}
