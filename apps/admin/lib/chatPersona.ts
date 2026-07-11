/**
 * Bridges bot_personas (admin-configured) into the /api/chat pipeline:
 * loads the tenant's active persona, composes the base system prompt that
 * @lume/rag's assembleSystemPrompt accepts, and turns persona capabilities
 * into both the advertised action shapes and a server-side action filter.
 *
 * Chat must never break because persona storage is missing or unreadable —
 * every path here degrades to defaultPersona().
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@lume/db";
import type { BotAction, BotPersona, BotPersonaCapabilities } from "@lume/types";
import { defaultPersona, rowToBotPersona, type BotPersonaRow } from "./persona";

type DbClient = SupabaseClient<Database, "public">;

export async function loadActivePersona(
  client: DbClient,
  tenantId: string
): Promise<BotPersona> {
  try {
    const { data, error } = await client
      .from("bot_personas")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .maybeSingle();
    if (error || !data) return defaultPersona(tenantId);
    return rowToBotPersona(data as BotPersonaRow);
  } catch {
    return defaultPersona(tenantId);
  }
}

const TONE_INSTRUCTIONS: Record<BotPersona["tone"], string> = {
  cinematic:
    "Speak with quiet, cinematic confidence — evocative but never florid; short sentences with weight.",
  concise: "Be brief and direct. No filler, no preamble, answers first.",
  warm: "Be warm, personable and encouraging while staying professional.",
  formal: "Use polished, formal language. No slang, no exclamation marks.",
  technical: "Be precise and specification-driven. Prefer exact figures over adjectives.",
};

/**
 * Compose the persona-aware base prompt handed to assembleSystemPrompt.
 * Grounding rules stay here (not in the editable system_prompt) so a tenant
 * can't accidentally delete the anti-hallucination constraints.
 */
export function personaBasePrompt(persona: BotPersona, tenantName: string): string {
  const parts = [
    `You are ${persona.name}, the AI concierge for ${tenantName}.`,
    TONE_INSTRUCTIONS[persona.tone],
    persona.systemPrompt.trim(),
    "Grounding rules: answer only from the supplied context, inventory and tool results. " +
      "For vehicle count questions use the exact TOTAL MATCHING value — never count the sample rows. " +
      "If the information is not available, say so plainly.",
  ];
  return parts.filter(Boolean).join("\n");
}

type ActionShape = {
  /** Example JSON line advertised to the model. */
  example: string;
  /** Which capability gates it; null = always available. */
  capability: keyof BotPersonaCapabilities | null;
};

const ACTION_SHAPES: Record<string, ActionShape> = {
  filter_inventory: {
    example: `{"type":"filter_inventory","make":"string","priceMin":0,"priceMax":0,"bodyStyle":"string"}`,
    capability: "filterInventory",
  },
  navigate: {
    example: `{"type":"navigate","route":"string"}`,
    capability: "navigate",
  },
  "highlight-vehicle": {
    example: `{"type":"highlight-vehicle","vehicleId":"string"}`,
    capability: null,
  },
  "open-lead-form": {
    example: `{"type":"open-lead-form","prefill":{}}`,
    capability: "openLeadForm",
  },
  capture_lead: {
    example: `{"type":"capture_lead","contact":{"email":"string","phone":"string","firstName":"string","lastName":"string","message":"string"},"vehicleId":"string"}`,
    capability: "captureLead",
  },
  "scroll-to": {
    example: `{"type":"scroll-to","sectionId":"string"}`,
    capability: null,
  },
};

function capabilityEnabled(
  capabilities: BotPersonaCapabilities,
  key: keyof BotPersonaCapabilities | null
): boolean {
  if (key === null) return true;
  return capabilities[key] !== false;
}

/** The structured-actions prompt, advertising only capability-allowed shapes. */
export function actionSystemPrompt(
  capabilities: BotPersonaCapabilities,
  callableToolNames: readonly string[] = [
    "find_vehicles",
    "find_best_deal",
    "get_vehicle_details",
    "compare_vehicles",
  ],
): string {
  const shapes = Object.values(ACTION_SHAPES)
    .filter((shape) => capabilityEnabled(capabilities, shape.capability))
    .map((shape) => shape.example);
  if (shapes.length === 0 && callableToolNames.length === 0) return "";
  const sections: string[] = [];
  if (shapes.length > 0) {
    sections.push(
      "Structured actions:",
      "When an action would help the user, you may emit exactly one JSON object on its own line. Keep normal helpful text streaming as usual. The JSON line must match one of these shapes:",
      ...shapes,
      "Only include fields that are useful. Do not wrap action JSON in markdown.",
    );
  }
  if (callableToolNames.length > 0) {
    sections.push(
      `Callable function tools: ${callableToolNames.join(", ")}. Prefer these for inventory questions; they query the live database.`,
    );
  }
  return ["", ...sections].join("\n");
}

/**
 * Server-side enforcement: drop actions the persona's capabilities don't
 * allow, regardless of what the model (or a tool) emitted.
 */
export function isActionAllowed(
  action: BotAction,
  capabilities: BotPersonaCapabilities
): boolean {
  const shape = ACTION_SHAPES[action.type];
  if (!shape) return false;
  return capabilityEnabled(capabilities, shape.capability);
}

export function filterAllowedActions(
  actions: readonly BotAction[],
  capabilities: BotPersonaCapabilities
): BotAction[] {
  return actions.filter((action) => isActionAllowed(action, capabilities));
}
