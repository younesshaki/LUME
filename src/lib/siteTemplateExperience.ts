import type { LeadCaptureInput, SiteTemplateAction } from "@lume/types";

export type TemplateLeadIntent =
  | "financing"
  | "test-drive"
  | "appointment"
  | "trade-in";

export type TemplateActionBehavior =
  | { kind: "navigate"; route: "vehicles" }
  | {
      kind: "lead";
      intent: TemplateLeadIntent;
      title: string;
      description: string;
      messagePrompt: string;
      messagePrefix: string;
      source: NonNullable<LeadCaptureInput["source"]>;
    };

const LEAD_ACTIONS: Record<
  Exclude<SiteTemplateAction, "browse-inventory">,
  Extract<TemplateActionBehavior, { kind: "lead" }>
> = {
  "explore-financing": {
    kind: "lead",
    intent: "financing",
    title: "Start a financing conversation",
    description:
      "Share how you would like to buy. A dealership specialist can explain available next steps without making an approval promise.",
    messagePrompt: "Tell us about your target vehicle, budget, or preferred monthly range.",
    messagePrefix: "[Website financing request]",
    source: "contact-form",
  },
  "book-test-drive": {
    kind: "lead",
    intent: "test-drive",
    title: "Request a test drive",
    description:
      "Tell the dealership what you would like to drive and when. The team will confirm availability and timing.",
    messagePrompt: "Which vehicle would you like to drive, and when works best?",
    messagePrefix: "[Website test-drive request]",
    source: "test-drive",
  },
  "book-appointment": {
    kind: "lead",
    intent: "appointment",
    title: "Reserve time with the dealership",
    description:
      "Request a prepared appointment with a specialist. The dealership will follow up to confirm the time.",
    messagePrompt: "What would you like help with, and what day or time do you prefer?",
    messagePrefix: "[Website appointment request]",
    source: "contact-form",
  },
  "value-trade": {
    kind: "lead",
    intent: "trade-in",
    title: "Start a trade-in conversation",
    description:
      "Share the basics of your current vehicle. The dealership will review the details rather than presenting an unverified instant value.",
    messagePrompt: "Include the year, make, model, mileage, and anything the appraiser should know.",
    messagePrefix: "[Website trade-in request]",
    source: "contact-form",
  },
};

export function resolveTemplateAction(
  action: SiteTemplateAction,
): TemplateActionBehavior {
  if (action === "browse-inventory") {
    return { kind: "navigate", route: "vehicles" };
  }
  return LEAD_ACTIONS[action];
}

export function prefixTemplateLeadMessage(
  behavior: Extract<TemplateActionBehavior, { kind: "lead" }>,
  message: string,
): string {
  const detail = message.trim();
  return detail ? `${behavior.messagePrefix}\n${detail}` : behavior.messagePrefix;
}
