import type { ActionKey } from "@/lib/sound";

export const vehiclePageSoundActions = {
  cardHover: "product.card.hover",
  cardOpen: "product.card.click",
  filterChange: "product.filter.click",
  filterOpen: "vehicle.filter.open",
  filterClose: "vehicle.filter.close",
  filterClear: "button.ghost.click",
  saveToggle: "vehicle.save.toggle",
  compareToggle: "vehicle.compare.toggle",
  searchClear: "vehicle.search.clear",
} as const satisfies Record<string, ActionKey>;
