import type { MemoryToolResult } from "@lume/bot";
import type {
  BotAction,
  BotPersonaCapabilities,
  ConciergeTarget,
  Vehicle,
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
  groundedVehicles?: readonly GroundedVehicleCandidate[];
  inventoryFilters?: GroundedInventoryFilters | null;
  capabilities: Pick<
    BotPersonaCapabilities,
    "navigate" | "filterInventory" | "openLeadForm"
  >;
};

type GroundedVehicleCandidate = Pick<
  Vehicle,
  "id" | "year" | "make" | "model" | "trim" | "price" | "mileage"
>;

type GroundedInventoryFilters = Partial<{
  make: string;
  model: string;
  bodyStyle: string;
  stockType: string;
  fuelType: string;
  drivetrain: string;
  sellerState: string;
  sellerCity: string;
  year: number;
  mileageMax: number;
  priceMin: number;
  priceMax: number;
}>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AFFIRMATIVE_PATTERN =
  /^(?:yes|yes please|yeah|yep|sure|okay|ok|please do|do it|absolutely|i would|sounds good)[.! ]*$/;
const EXPLICIT_NAVIGATION_PATTERN =
  /\b(?:take|bring|send|navigate|go|open|visit|show|view)\b/;
const INVENTORY_DISCOVERY_PATTERN =
  /\b(?:do you have|have any|are there|any|available|availability|browse|carry|find|inventory|looking for|offer|show|stock|take|open|view)\b/;
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

  const explicitNavigation = EXPLICIT_NAVIGATION_PATTERN.test(userText);
  if (explicitNavigation) {
    const exactVehicleId = exactGroundedVehicleId(
      lastUser.content,
      input.groundedVehicles ?? [],
    );
    if (exactVehicleId) {
      return targetAction(input.targets, "vehicle-detail", {
        vehicleId: exactVehicleId,
      });
    }
  }

  if (
    explicitNavigation &&
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

  const inventoryFilter = groundedInventoryFilterAction(
    userText,
    input.inventoryFilters,
    input.groundedVehicles ?? [],
    input.capabilities.filterInventory !== false,
  );
  if (inventoryFilter) return [inventoryFilter];

  if (!explicitNavigation) return [];

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

/**
 * Resolve an explicitly named vehicle only from the tenant-scoped matches
 * already loaded by the chat route. Numeric anchors are exact and ties fail
 * closed, so a similar model can never send the visitor to the wrong listing.
 */
export function exactGroundedVehicleId(
  userContent: string,
  vehicles: readonly GroundedVehicleCandidate[],
): string | null {
  if (vehicles.length === 0) return null;
  const normalizedUser = normalizeIntentText(userContent);
  const userTokens = new Set(normalizedUser.split(" ").filter(Boolean));
  const year = integerAnchor(userContent, /\b(20\d{2})\b/);
  const price = integerAnchor(userContent, /\$\s*([\d][\d,\s]*)/);
  const mileage = integerAnchor(
    userContent,
    /\b([\d][\d,\s]*)\s*(?:miles?|mi)\b/i,
  );

  const scored = vehicles.flatMap((vehicle) => {
    if (!UUID_PATTERN.test(vehicle.id)) return [];
    if (year !== null && vehicle.year !== year) return [];
    if (price !== null && Math.round(vehicle.price) !== price) return [];
    if (mileage !== null && vehicle.mileage !== mileage) return [];

    const makeTokens = meaningfulVehicleTokens(vehicle.make);
    if (
      makeTokens.length === 0 ||
      !makeTokens.some((token) => userTokens.has(token))
    ) {
      return [];
    }
    const detailTokens = meaningfulVehicleTokens(
      `${vehicle.model} ${vehicle.trim}`,
    ).filter((token) => !makeTokens.includes(token));
    const detailMatches = detailTokens.filter((token) => userTokens.has(token));
    if (detailMatches.length === 0) return [];

    return [{
      id: vehicle.id,
      score:
        detailMatches.length * 10 +
        (year !== null ? 5 : 0) +
        (price !== null ? 20 : 0) +
        (mileage !== null ? 20 : 0),
    }];
  });
  if (scored.length === 0) return null;
  scored.sort((left, right) => right.score - left.score);
  if (scored[0]?.score === scored[1]?.score) return null;
  return scored[0]?.id ?? null;
}

export function actionOnlyAcknowledgement(
  actions: readonly BotAction[],
): string {
  if (actions.some((action) => action.type === "filter_inventory")) {
    return "I’ve opened the inventory with those filters applied.";
  }
  if (
    actions.some(
      (action) =>
        action.type === "navigate" ||
        action.type === "navigate-target" ||
        action.type === "highlight-vehicle" ||
        action.type === "open-lead-form",
    )
  ) {
    return "Taking you there now.";
  }
  return "";
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

function groundedInventoryFilterAction(
  userText: string,
  filters: GroundedInventoryFilters | null | undefined,
  vehicles: readonly GroundedVehicleCandidate[],
  allowed: boolean,
): BotAction | null {
  if (
    !allowed ||
    !filters ||
    !INVENTORY_DISCOVERY_PATTERN.test(userText) ||
    filters.model ||
    filters.stockType ||
    filters.fuelType ||
    filters.drivetrain ||
    filters.sellerState ||
    filters.sellerCity ||
    filters.year !== undefined ||
    filters.mileageMax !== undefined
  ) {
    return null;
  }

  const make = filters.make?.trim();
  const bodyStyle = filters.bodyStyle?.trim();
  if (!make && !bodyStyle) return null;
  const canonicalMake = make
    ? vehicles.find(
        (vehicle) =>
          normalizeIntentText(vehicle.make) === normalizeIntentText(make),
      )?.make ?? make
    : undefined;
  return {
    type: "filter_inventory",
    ...(canonicalMake ? { make: canonicalMake } : {}),
    ...(bodyStyle ? { bodyStyle } : {}),
    ...(filters.priceMin !== undefined ? { priceMin: filters.priceMin } : {}),
    ...(filters.priceMax !== undefined ? { priceMax: filters.priceMax } : {}),
  };
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

function meaningfulVehicleTokens(value: string): string[] {
  return [
    ...new Set(
      normalizeIntentText(value)
        .split(" ")
        .filter((token) => token.length >= 2),
    ),
  ];
}

function integerAnchor(
  value: string,
  pattern: RegExp,
): number | null {
  const match = pattern.exec(value);
  if (!match?.[1]) return null;
  const parsed = Number(match[1].replace(/[,\s]/g, ""));
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
