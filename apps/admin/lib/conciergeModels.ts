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

export function isProviderAvailable(
  modelId: ConciergeModelId,
  availability: Readonly<Record<ConciergeProvider, boolean>>,
): boolean {
  return availability[getConciergeModelProfile(modelId).provider];
}
