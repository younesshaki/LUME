import type { MemoryToolResult } from "@lume/bot";
import type {
  BotAction,
  BotPersonaCapabilities,
  ConciergeTarget,
} from "@lume/types";
import {
  extractDeepseekDsmlToolCalls,
  extractInlineActions,
} from "./botActions";

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type DeterministicConciergeNavigationInput = {
  messages: readonly ConversationMessage[];
  targets: readonly ConciergeTarget[];
  selectedVehicleId?: string | null;
  capabilities: Pick<
    BotPersonaCapabilities,
    "navigate" | "openLeadForm"
  >;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AFFIRMATIVE_PATTERN =
  /^(?:yes|yes please|yeah|yep|sure|okay|ok|please do|do it|absolutely|i would|sounds good)[.! ]*$/;
const EXPLICIT_NAVIGATION_PATTERN =
  /\b(?:take|bring|send|navigate|go|open|visit|show|view)\b/;
const IGNORED_TARGET_WORDS = new Set([
  "and",
  "form",
  "my",
  "page",
  "public",
  "the",
  "to",
  "visitor",
  "website",
]);

/**
 * Resolve only high-confidence navigation requests. This complements model
 * actions; it never submits a lead or mutates data, and all emitted targets
 * still pass through the trusted registry preparation in the chat route.
 */
export function resolveDeterministicConciergeNavigation(
  input: DeterministicConciergeNavigationInput,
): BotAction[] {
  if (input.capabilities.navigate === false) return [];
  const lastUser = [...input.messages]
    .reverse()
    .find((message) => message.role === "user");
  if (!lastUser) return [];
  const userText = normalizeIntentText(lastUser.content);
  if (!userText) return [];

  const previousAssistant = previousAssistantMessage(input.messages);
  if (
    input.selectedVehicleId &&
    AFFIRMATIVE_PATTERN.test(userText) &&
    previousAssistant &&
    /\b(?:inquiry|inquire|contact form|request more information)\b/.test(
      normalizeIntentText(previousAssistant.content),
    )
  ) {
    const key = /\b(?:inquiry|inquire|vehicle)\b/.test(
      normalizeIntentText(previousAssistant.content),
    )
      ? "vehicle-inquiry"
      : "contact-lead-form";
    return targetAction(
      input.targets,
      key,
      key === "vehicle-inquiry"
        ? { vehicleId: input.selectedVehicleId }
        : undefined,
      input.capabilities.openLeadForm !== false,
    );
  }

  if (!EXPLICIT_NAVIGATION_PATTERN.test(userText)) return [];

  if (
    input.selectedVehicleId &&
    (/\b(?:that|this|its)\s+(?:page|listing|vehicle|car|details?)\b/.test(
      userText,
    ) ||
      /\b(?:vehicle|car)\s+(?:page|listing|details?)\b/.test(userText))
  ) {
    return targetAction(input.targets, "vehicle-detail", {
      vehicleId: input.selectedVehicleId,
    });
  }

  const knownKey = knownTargetKey(userText);
  if (knownKey) {
    return targetAction(
      input.targets,
      knownKey,
      undefined,
      input.capabilities.openLeadForm !== false,
    );
  }

  const custom = input.targets.find((target) => {
    const words = targetWords(target);
    return (
      target.enabled &&
      !target.destination.includes(":") &&
      words.length > 0 &&
      words.every((word) => userText.includes(word))
    );
  });
  if (!custom) return [];
  return targetAction(
    input.targets,
    custom.key,
    undefined,
    input.capabilities.openLeadForm !== false,
  );
}

/** Find the latest exact VDP selected by a trusted inventory tool result. */
export function recentVehicleIdFromToolResults(
  results: readonly MemoryToolResult[],
): string | null {
  for (const entry of [...results].reverse()) {
    if (entry.name !== "get_vehicle_details" || !isRecord(entry.result)) continue;
    const data = entry.result.data;
    if (!isRecord(data) || !isRecord(data.vehicle)) continue;
    const id = data.vehicle.id;
    if (typeof id === "string" && UUID_PATTERN.test(id)) return id;
  }
  return null;
}

/**
 * Recover selection continuity from old client history that may still contain
 * leaked DSML or legacy inline actions. The route must tenant-scope and
 * revalidate the returned ID before using it.
 */
export function recentVehicleIdFromAssistantHistory(
  messages: readonly ConversationMessage[],
): string | null {
  for (const message of [...messages].reverse()) {
    if (message.role !== "assistant") continue;
    const calls = extractDeepseekDsmlToolCalls(message.content, [
      "get_vehicle_details",
    ]);
    for (const call of [...calls].reverse()) {
      try {
        const args = JSON.parse(call.function.arguments) as unknown;
        if (
          isRecord(args) &&
          typeof args.vehicleId === "string" &&
          UUID_PATTERN.test(args.vehicleId)
        ) {
          return args.vehicleId;
        }
      } catch {
        // The DSML normalizer already bounds values; malformed JSON is ignored.
      }
    }

    for (const action of extractInlineActions(message.content).reverse()) {
      const vehicleId =
        action.type === "highlight-vehicle"
          ? action.vehicleId
          : action.type === "navigate-target" ||
              action.type === "open-lead-form" ||
              action.type === "capture_lead"
            ? action.type === "navigate-target"
              ? action.params?.vehicleId
              : action.vehicleId
            : undefined;
      if (vehicleId && UUID_PATTERN.test(vehicleId)) return vehicleId;
    }
  }
  return null;
}

function knownTargetKey(value: string): string | null {
  if (/\b(?:contact(?: us)?(?: page| form)?|contact form)\b/.test(value)) {
    return "contact-lead-form";
  }
  if (/\b(?:products?|collaborations?)\b/.test(value)) return "products";
  if (/\b(?:inventory|vehicles? page|cars? page)\b/.test(value)) {
    return "inventory";
  }
  if (/\b(?:home|home page|homepage)\b/.test(value)) return "home";
  if (/\b(?:showcase|cinematic experience|experience page)\b/.test(value)) {
    return "showcase";
  }
  if (
    /\b(?:account|profile|saved vehicles|shortlist|loyalty(?: page)?)\b/.test(
      value,
    )
  ) {
    return "account";
  }
  return null;
}

function targetAction(
  targets: readonly ConciergeTarget[],
  key: string,
  params?: Record<string, string>,
  allowLeadForms = true,
): BotAction[] {
  const target = targets.find(
    (candidate) => candidate.enabled && candidate.key === key,
  );
  if (!target) return [];
  if (
    !allowLeadForms &&
    target.isConversion &&
    (target.kind === "form" || target.kind === "modal")
  ) {
    return [];
  }
  return [
    {
      type: "navigate-target",
      targetKey: target.key,
      ...(params ? { params } : {}),
    },
  ];
}

function previousAssistantMessage(
  messages: readonly ConversationMessage[],
): ConversationMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role !== "user") continue;
    const previous = messages[index - 1];
    return previous?.role === "assistant" ? previous : null;
  }
  return null;
}

function targetWords(target: ConciergeTarget): string[] {
  const words = normalizeIntentText(`${target.key} ${target.label}`)
    .split(" ")
    .filter(
      (word) =>
        word.length >= 3 &&
        !IGNORED_TARGET_WORDS.has(word),
    );
  return [...new Set(words)];
}

function normalizeIntentText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
