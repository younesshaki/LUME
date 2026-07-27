export const CONCIERGE_MODEL_PROFILES = [
  {
    id: "deepseek-v4-flash",
    provider: "deepseek",
    providerLabel: "DeepSeek",
    modelLabel: "V4 Flash",
    levelLabel: "Fast",
    description: "Speed-first responses for everyday inventory and navigation questions.",
    speedLabel: "Fastest",
    costLabel: "Lowest",
    iconSrc: "/model-icons/deepseek.svg",
    iconBadge: "F",
    thinkingMode: "disabled",
    premium: false,
  },
  {
    id: "kimi-k2.6",
    provider: "moonshot",
    providerLabel: "Kimi",
    modelLabel: "K2.6",
    levelLabel: "Balanced",
    description: "A broader alternative model with strong instruction and tool handling.",
    speedLabel: "Fast",
    costLabel: "Moderate",
    iconSrc: "/model-icons/kimi.svg",
    iconBadge: "2.6",
    thinkingMode: "disabled",
    premium: true,
  },
  {
    id: "deepseek-v4-pro",
    provider: "deepseek",
    providerLabel: "DeepSeek",
    modelLabel: "V4 Pro",
    levelLabel: "Expert",
    description: "More capable reasoning for nuanced comparisons and complex requests.",
    speedLabel: "Measured",
    costLabel: "Higher",
    iconSrc: "/model-icons/deepseek.svg",
    iconBadge: "P",
    thinkingMode: "disabled",
    premium: true,
  },
  {
    id: "kimi-k3",
    provider: "moonshot",
    providerLabel: "Kimi",
    modelLabel: "K3",
    levelLabel: "Maximum",
    description: "Kimi's flagship reasoning model for the most demanding conversations.",
    speedLabel: "Deep",
    costLabel: "Highest",
    iconSrc: "/model-icons/kimi.svg",
    iconBadge: "3",
    thinkingMode: "max",
    premium: true,
  },
  {
    id: "openai-gpt-5.4-mini",
    provider: "gateway",
    providerLabel: "OpenAI",
    modelLabel: "GPT-5.4 Mini",
    gatewayModelId: "openai/gpt-5.4-mini",
    levelLabel: "Accurate",
    description: "A fast frontier model for difficult language understanding and structured plans.",
    speedLabel: "Fast",
    costLabel: "Moderate",
    iconSrc: "/model-icons/openai.svg",
    iconBadge: "5.4",
    thinkingMode: "disabled",
    premium: true,
  },
  {
    id: "anthropic-claude-sonnet-4.6",
    provider: "gateway",
    providerLabel: "Anthropic",
    modelLabel: "Claude Sonnet 4.6",
    gatewayModelId: "anthropic/claude-sonnet-4.6",
    levelLabel: "Frontier",
    description: "A frontier model for nuanced requests that still returns only LUME's closed command plan.",
    speedLabel: "Measured",
    costLabel: "Higher",
    iconSrc: "/model-icons/anthropic.svg",
    iconBadge: "4.6",
    thinkingMode: "disabled",
    premium: true,
  },
] as const;

export type ConciergeModelProfile = (typeof CONCIERGE_MODEL_PROFILES)[number];
export type ConciergeModelId = ConciergeModelProfile["id"];
export type ConciergeProvider = ConciergeModelProfile["provider"];
export type ConciergeThinkingMode = ConciergeModelProfile["thinkingMode"];

export const DEFAULT_CONCIERGE_MODEL_ID: ConciergeModelId = "deepseek-v4-flash";

const PROFILE_BY_ID = new Map<ConciergeModelId, ConciergeModelProfile>(
  CONCIERGE_MODEL_PROFILES.map((profile) => [profile.id, profile]),
);

const LEGACY_MODEL_ALIASES: Readonly<Record<string, ConciergeModelId>> = {
  "deepseek-chat": "deepseek-v4-flash",
  "deepseek-reasoner": "deepseek-v4-flash",
};

export function isConciergeModelId(value: unknown): value is ConciergeModelId {
  return typeof value === "string" && PROFILE_BY_ID.has(value as ConciergeModelId);
}

export function normalizeConciergeModelId(value: unknown): ConciergeModelId {
  if (isConciergeModelId(value)) return value;
  if (typeof value === "string") {
    return LEGACY_MODEL_ALIASES[value] ?? DEFAULT_CONCIERGE_MODEL_ID;
  }
  return DEFAULT_CONCIERGE_MODEL_ID;
}

export function getConciergeModelProfile(
  value: unknown,
): ConciergeModelProfile {
  return (
    PROFILE_BY_ID.get(normalizeConciergeModelId(value)) ??
    CONCIERGE_MODEL_PROFILES[0]
  );
}

export function conciergeModelIndex(value: unknown): number {
  const modelId = normalizeConciergeModelId(value);
  const index = CONCIERGE_MODEL_PROFILES.findIndex(
    (profile) => profile.id === modelId,
  );
  return index < 0 ? 0 : index;
}

/**
 * Intelligence levels above the base model are a paid capability
 * ("chat.premium_models"): Pro/Ultra only. The base level is never premium
 * so every plan always has a working concierge.
 */
export function isPremiumConciergeModel(value: unknown): boolean {
  return getConciergeModelProfile(value).premium;
}

export function isProviderAvailable(
  modelId: ConciergeModelId,
  availability: Readonly<Record<ConciergeProvider, boolean>>,
): boolean {
  return availability[getConciergeModelProfile(modelId).provider];
}
