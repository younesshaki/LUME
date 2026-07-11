export const ONBOARDING_DISMISSAL_VALUE = "dismissed";

export type OnboardingChecklistItem = {
  id: "logo" | "inventory" | "persona" | "team" | "domain";
  label: string;
  complete: boolean;
  href: string;
};

export type BotPersonaSetupState = {
  name: string;
  tone: string;
  system_prompt: string;
  created_at: string;
  updated_at: string;
};

export function onboardingDismissalKey(tenantId: string): string {
  return `lume:onboarding-checklist:v1:${tenantId}`;
}

export function onboardingProgress(items: readonly OnboardingChecklistItem[]): {
  completed: number;
  total: number;
  percentage: number;
  allComplete: boolean;
} {
  const completed = items.reduce((count, item) => count + (item.complete ? 1 : 0), 0);
  const total = items.length;
  return {
    completed,
    total,
    percentage: total === 0 ? 0 : Math.round((completed / total) * 100),
    allComplete: total > 0 && completed === total,
  };
}

export function shouldHideOnboardingChecklist(
  allComplete: boolean,
  storedValue: string | null,
): boolean {
  return allComplete && storedValue === ONBOARDING_DISMISSAL_VALUE;
}

export function isBotPersonaConfigured(persona: BotPersonaSetupState | null): boolean {
  if (!persona) return false;
  return (
    persona.name.trim() !== "LUME Concierge" ||
    persona.tone !== "cinematic" ||
    persona.system_prompt.trim().length > 0 ||
    persona.updated_at !== persona.created_at
  );
}

/** Recognize current and forward-compatible logo keys inside tenants.theme. */
export function tenantThemeHasLogo(theme: Record<string, unknown>): boolean {
  const branding = asRecord(theme.branding);
  const logo = asRecord(theme.logo);
  return [
    theme.logoUrl,
    theme.logo_url,
    branding?.logoUrl,
    branding?.logo_url,
    logo?.url,
  ].some((value) => typeof value === "string" && value.trim().length > 0);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
