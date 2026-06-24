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
