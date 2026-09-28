import { DEFAULT_PUBLIC_TENANT_SLUG } from "@/lib/publicTenant";

export type ChatCopy = {
  welcome: string;
  suggestions: string[];
  /** Shown until the chat stream's meta event names the tenant's persona. */
  defaultBotName: string;
};

const HOUSE_COPY: ChatCopy = {
  welcome: "Ask me anything about LUME — our products, philosophy, or how access works.",
  suggestions: [
    "What is LUME?",
    "What products does LUME have?",
    "Do you have any Ferraris?",
    "How do I get access to LUME?",
  ],
  defaultBotName: "LUME",
};

const DEALER_COPY: ChatCopy = {
  welcome: "Ask me anything about our vehicles, financing, trade-ins, or booking a test drive.",
  suggestions: [
    "What vehicles do you have in stock?",
    "Do you offer financing?",
    "Can I trade in my current car?",
    "How do I book a test drive?",
  ],
  defaultBotName: "Assistant",
};

/** LUME's own site keeps its concept copy; a dealership's chat never mentions LUME. */
export function chatCopyFor(slug: string): ChatCopy {
  return slug === DEFAULT_PUBLIC_TENANT_SLUG ? HOUSE_COPY : DEALER_COPY;
}

/** Accessible names for the widget: the dealership's name once known, never LUME's. */
export function chatAssistantLabels(brand: string): { open: string; panel: string; input: string; placeholder: string } {
  return brand
    ? { open: `Open ${brand} assistant`, panel: `${brand} assistant`, input: `Message ${brand} assistant`, placeholder: `Message ${brand}` }
    : { open: "Open chat assistant", panel: "Chat assistant", input: "Message the assistant", placeholder: "Message us" };
}
