import type { TenantId } from "./tenant";

export type BotPersonaId = string;

export type BotPersonaTone =
  | "cinematic"
  | "concise"
  | "warm"
  | "formal"
  | "technical";

export type BotPersonaCapabilities = {
  navigate?: boolean;
  filterInventory?: boolean;
  openLeadForm?: boolean;
  captureLead?: boolean;
  scheduleAppointment?: boolean;
};

export type BotPersona = {
  id: BotPersonaId;
  tenantId: TenantId;
  name: string;
  tone: BotPersonaTone;
  systemPrompt: string;
  capabilities: BotPersonaCapabilities;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_BOT_PERSONA_SYSTEM_PROMPT =
  "Represent this tenant with discretion. Keep responses accurate, tenant-specific, and action-oriented. Use the configured capabilities only when they directly help the visitor.";

/**
 * The concierge name a newly provisioned tenant should start with.
 *
 * LUME is white-label: the visitor talking to this bot is the *dealer's*
 * customer, not ours. The `bot_personas.name` column defaults to the literal
 * "LUME Concierge", and provisioning used to insert a row with only
 * `tenant_id`, so every tenant shipped a bot that introduced itself with our
 * vendor brand on their own storefront. `personaBasePrompt()` renders it as
 * "You are {name}, the AI concierge for {tenantName}" — so an unconfigured
 * tenant literally read "You are LUME Concierge, the AI concierge for
 * Some Dealership".
 *
 * Tenants remain free to rename it; this is only the starting value.
 */
export function defaultBotPersonaName(tenantName: string): string {
  const trimmed = tenantName.trim();
  if (!trimmed) return "Concierge";
  // Avoid "LUME Concierge Concierge" for a tenant already named that way.
  if (/\bconcierge\b/i.test(trimmed)) return trimmed;
  return `${trimmed} Concierge`;
}
