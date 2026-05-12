import { useEffect } from "react";
import { useUIStore } from "@/lib/ui-state";

type VehiclesPageStateBridgeInput = {
  filtersOpen: boolean;
  compareOpen: boolean;
  compareCount: number;
};

export function useVehiclesPageStateBridge({
  filtersOpen,
  compareOpen,
  compareCount,
}: VehiclesPageStateBridgeInput) {
  const setFilterDrawer = useUIStore((state) => state.setFilterDrawer);
  const setComparePanel = useUIStore((state) => state.setComparePanel);

  useEffect(() => {
    setFilterDrawer({ open: filtersOpen, side: "left" });
  }, [filtersOpen, setFilterDrawer]);

  useEffect(() => {
    setComparePanel({
      active: compareOpen || compareCount > 0,
      itemCount: compareCount,
    });
  }, [compareCount, compareOpen, setComparePanel]);

  useEffect(() => {
    return () => {
      setFilterDrawer({ open: false, side: "left" });
      setComparePanel({ active: false, itemCount: 0 });
    };
  }, [setComparePanel, setFilterDrawer]);
}
