import type {
  BotAction,
  BotActionLeadSourceContext,
  LeadCaptureInput,
} from "@lume/types";

export type LeadFormRequest = {
  path: string;
  handlerId: string;
  input: LeadCaptureInput;
};

export function leadInput(
  action: Extract<
    BotAction,
    { type: "open-lead-form" | "capture_lead" | "navigate-target" }
  >,
): LeadCaptureInput {
  const values =
    action.type === "capture_lead"
      ? action.contact
      : action.type === "open-lead-form"
        ? action.prefill
        : action.params;
  const input: LeadCaptureInput = { source: "chat" };
  for (const [key, limit] of Object.entries({
    firstName: 100,
    lastName: 100,
    email: 320,
    phone: 100,
    message: 4000,
  })) {
    const value = values?.[key as keyof typeof values];
    if (typeof value === "string" && value.trim())
      Object.assign(input, { [key]: value.trim().slice(0, limit) });
  }
  const vehicleId =
    action.type === "navigate-target"
      ? action.params?.vehicleId
      : action.vehicleId;
  if (typeof vehicleId === "string" && /^[0-9a-f-]{36}$/i.test(vehicleId))
    input.vehicleId = vehicleId;
  const context: BotActionLeadSourceContext = {
    trigger: "bot-action",
    actionType:
      action.type === "capture_lead" ? "capture_lead" : "open-lead-form",
  };
  if (input.vehicleId) context.vehicleId = input.vehicleId;
  const attribution = action.attribution;
  const targetKey =
    action.type === "navigate-target"
      ? action.targetKey
      : attribution?.targetKey;
  if (targetKey) context.targetKey = targetKey.slice(0, 64);
  if (attribution?.sessionId)
    context.chatSessionId = attribution.sessionId.slice(0, 100);
  if (attribution?.conversationContext)
    context.conversationContext = attribution.conversationContext.slice(
      0,
      1200,
    );
  input.sourceContext = context;
  return input;
}
