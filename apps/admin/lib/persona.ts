import type {
  BotPersona,
  BotPersonaCapabilities,
  BotPersonaTone,
} from "@lume/types";
import { DEFAULT_BOT_PERSONA_SYSTEM_PROMPT } from "@lume/types";

export type BotPersonaRow = {
  id: string;
  tenant_id: string;
  name: string;
  tone: string;
  system_prompt: string;
  capabilities: unknown;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type BotPersonaForm = {
  name: string;
  tone: BotPersonaTone;
  systemPrompt: string;
  capabilities: Required<BotPersonaCapabilities>;
};

export const BOT_PERSONA_TONES: Array<{ label: string; value: BotPersonaTone }> = [
  { label: "Cinematic", value: "cinematic" },
  { label: "Concise", value: "concise" },
  { label: "Warm", value: "warm" },
  { label: "Formal", value: "formal" },
  { label: "Technical", value: "technical" },
];

export const DEFAULT_BOT_PERSONA_CAPABILITIES: Required<BotPersonaCapabilities> = {
  navigate: true,
  filterInventory: true,
  openLeadForm: true,
  captureLead: true,
  scheduleAppointment: false,
};

/** Re-exported so existing admin imports keep working; owned by @lume/types
 *  because tenant provisioning (scripts/create-tenant.ts) needs it too. */
export const DEFAULT_SYSTEM_PROMPT = DEFAULT_BOT_PERSONA_SYSTEM_PROMPT;

export function defaultPersona(tenantId: string): BotPersona {
  const now = new Date(0).toISOString();
  return {
    id: "",
    tenantId,
    name: "LUME Concierge",
    tone: "cinematic",
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    capabilities: DEFAULT_BOT_PERSONA_CAPABILITIES,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function rowToBotPersona(row: BotPersonaRow): BotPersona {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    tone: isBotPersonaTone(row.tone) ? row.tone : "cinematic",
    systemPrompt: row.system_prompt,
    capabilities: normalizeCapabilities(row.capabilities),
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function formFromPersona(persona: BotPersona): BotPersonaForm {
  return {
    name: persona.name,
    tone: persona.tone,
    systemPrompt: persona.systemPrompt,
    capabilities: normalizeCapabilities(persona.capabilities),
  };
}

export function payloadFromPersonaForm(
  tenantId: string,
  form: BotPersonaForm
): Omit<BotPersonaRow, "id" | "created_at" | "updated_at"> {
  return {
    tenant_id: tenantId,
    name: form.name.trim() || "LUME Concierge",
    tone: form.tone,
    system_prompt: form.systemPrompt.trim(),
    capabilities: form.capabilities,
    is_active: true,
  };
}

export function personaMigrationWarning(message: string): string {
  if (message.toLowerCase().includes("bot_personas")) {
    return "Bot persona storage is not available yet. Apply migration 021_bot_personas.sql before saving persona changes.";
  }
  return `Unable to load bot persona: ${message}`;
}

function normalizeCapabilities(value: unknown): Required<BotPersonaCapabilities> {
  const source = isRecord(value) ? value : {};
  return {
    navigate: booleanValue(source.navigate, DEFAULT_BOT_PERSONA_CAPABILITIES.navigate),
    filterInventory: booleanValue(
      source.filterInventory,
      DEFAULT_BOT_PERSONA_CAPABILITIES.filterInventory
    ),
    openLeadForm: booleanValue(source.openLeadForm, DEFAULT_BOT_PERSONA_CAPABILITIES.openLeadForm),
    captureLead: booleanValue(source.captureLead, DEFAULT_BOT_PERSONA_CAPABILITIES.captureLead),
    scheduleAppointment: booleanValue(
      source.scheduleAppointment,
      DEFAULT_BOT_PERSONA_CAPABILITIES.scheduleAppointment
    ),
  };
}

function isBotPersonaTone(value: string): value is BotPersonaTone {
  return BOT_PERSONA_TONES.some((tone) => tone.value === value);
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
