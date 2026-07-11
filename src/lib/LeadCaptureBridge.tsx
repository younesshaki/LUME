import { useBotAction } from "./useBotAction";
import { submitLead } from "./leads";

export function LeadCaptureBridge() {
  useBotAction("capture_lead", (action) => {
    void submitLead({
      ...action.contact,
      vehicleId: action.vehicleId,
      source: "chat",
      sourceContext: {
        trigger: "bot-action",
        actionType: "capture_lead",
        ...(action.vehicleId ? { vehicleId: action.vehicleId } : {}),
      },
    }).catch((error) => {
      console.warn("[leads] bot capture_lead failed", error);
    });
  });

  return null;
}
