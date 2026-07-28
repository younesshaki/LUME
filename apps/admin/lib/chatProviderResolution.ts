import {
  CONCIERGE_MODEL_PROFILES,
  DEFAULT_CONCIERGE_MODEL_ID,
  getConciergeModelProfile,
  normalizeConciergeModelId,
  type ConciergeModelId,
  type ConciergeModelProfile,
  type ConciergeProvider,
} from "./conciergeModels";

export type ConciergeProviderAvailability = Record<
  ConciergeProvider,
  boolean
>;

export type ResolvedChatProvider = {
  requestedModelId: ConciergeModelId;
  profile: ConciergeModelProfile;
  apiKey: string;
  apiUrl: string;
  fellBack: boolean;
};

export type ChatProviderEnvironment = Readonly<
  Record<string, string | undefined>
> & {
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_API_URL?: string;
  MOONSHOT_API_KEY?: string;
  MOONSHOT_API_URL?: string;
  /**
   * Vercel AI Gateway key. It is server-only; no tenant or browser can select
   * an arbitrary upstream URL or send this value to the client.
   */
  AI_GATEWAY_API_KEY?: string;
  AI_GATEWAY_API_URL?: string;
};

export function providerAvailabilityFromEnvironment(
  environment: ChatProviderEnvironment,
): ConciergeProviderAvailability {
  return {
    deepseek: Boolean(environment.DEEPSEEK_API_KEY?.trim()),
    moonshot: Boolean(environment.MOONSHOT_API_KEY?.trim()),
    gateway: Boolean(environment.AI_GATEWAY_API_KEY?.trim()),
  };
}

export function isModelConfiguredInEnvironment(
  modelId: ConciergeModelId,
  environment: ChatProviderEnvironment,
): boolean {
  const profile = getConciergeModelProfile(modelId);
  return providerAvailabilityFromEnvironment(environment)[profile.provider];
}

export function resolveChatProviderFromEnvironment(
  configuredModel: unknown,
  environment: ChatProviderEnvironment,
): ResolvedChatProvider | null {
  const requestedModelId = normalizeConciergeModelId(configuredModel);
  const requestedProfile = getConciergeModelProfile(requestedModelId);
  const availability = providerAvailabilityFromEnvironment(environment);
  const effectiveProfile =
    availability[requestedProfile.provider]
      ? requestedProfile
      : fallbackProfile(availability);
  if (!effectiveProfile) return null;

  const apiKey = effectiveProfile.provider === "deepseek"
    ? environment.DEEPSEEK_API_KEY?.trim()
    : effectiveProfile.provider === "moonshot"
      ? environment.MOONSHOT_API_KEY?.trim()
      : environment.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) return null;

  return {
    requestedModelId,
    profile: effectiveProfile,
    apiKey,
    apiUrl:
      effectiveProfile.provider === "deepseek"
        ? environment.DEEPSEEK_API_URL?.trim() ||
          "https://api.deepseek.com/v1/chat/completions"
        : effectiveProfile.provider === "moonshot"
          ? environment.MOONSHOT_API_URL?.trim() ||
            "https://api.moonshot.ai/v1/chat/completions"
          : environment.AI_GATEWAY_API_URL?.trim() ||
            "https://ai-gateway.vercel.sh/v1/chat/completions",
    fellBack: effectiveProfile.id !== requestedModelId,
  };
}

function fallbackProfile(
  availability: ConciergeProviderAvailability,
): ConciergeModelProfile | null {
  const preferredIds: readonly ConciergeModelId[] = [
    DEFAULT_CONCIERGE_MODEL_ID,
    "kimi-k2.6",
    "openai-gpt-5.4-mini",
    "anthropic-claude-sonnet-4.6",
  ];
  for (const modelId of preferredIds) {
    const profile = getConciergeModelProfile(modelId);
    if (availability[profile.provider]) return profile;
  }
  return (
    CONCIERGE_MODEL_PROFILES.find(
      (profile) => availability[profile.provider],
    ) ?? null
  );
}
