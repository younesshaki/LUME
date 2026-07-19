import { useState } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { useBotAction } from "./useBotAction";
import { submitLead } from "./leads";
import "./LeadCaptureBridge.css";

export function LeadCaptureBridge() {
  const [status, setStatus] = useState<
    | { type: "submitting"; message: string }
    | { type: "success"; message: string }
    | { type: "error"; message: string }
    | null
  >(null);

  useBotAction("capture_lead", (action) => {
    setStatus({ type: "submitting", message: "Sending your details…" });
    void submitLead({
      ...action.contact,
      vehicleId: action.vehicleId,
      source: "chat",
      sourceContext: {
        trigger: "bot-action",
        actionType: "capture_lead",
        ...(action.vehicleId ? { vehicleId: action.vehicleId } : {}),
        ...(action.attribution?.targetKey
          ? { targetKey: action.attribution.targetKey }
          : {}),
        ...(action.attribution?.sessionId
          ? { chatSessionId: action.attribution.sessionId }
          : {}),
        ...(action.attribution?.conversationContext
          ? { conversationContext: action.attribution.conversationContext }
          : {}),
      },
    })
      .then(() => {
        setStatus({
          type: "success",
          message: "Your details were sent to the dealership.",
        });
      })
      .catch(() => {
        setStatus({
          type: "error",
          message: "We could not send your details. Please use the contact form.",
        });
      });
  });

  if (!status) return null;
  const StatusIcon = status.type === "success" ? CheckCircle2 : AlertCircle;

  return (
    <div
      className={`botLeadStatus botLeadStatus--${status.type}`}
      role={status.type === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <StatusIcon aria-hidden="true" />
      <span>{status.message}</span>
      {status.type !== "submitting" ? (
        <button
          type="button"
          aria-label="Dismiss lead status"
          onClick={() => setStatus(null)}
        >
          <X aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
