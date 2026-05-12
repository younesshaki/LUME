import type { ActionKey } from "@/lib/sound";

export const vehicleDetailSoundActions = {
  inquiryOpen: "vehicle.inquiry.open",
  inquirySubmit: "vehicle.inquiry.submit",
  saveToggle: "vehicle.save.toggle",
  compareToggle: "vehicle.compare.toggle",
} as const satisfies Record<string, ActionKey>;
