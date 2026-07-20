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
};

export function providerAvailabilityFromEnvironment(
  environment: ChatProviderEnvironment,
): ConciergeProviderAvailability {
  return {
    deepseek: Boolean(environment.DEEPSEEK_API_KEY?.trim()),
    moonshot: Boolean(environment.MOONSHOT_API_KEY?.trim()),
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

  const apiKey =
    effectiveProfile.provider === "deepseek"
      ? environment.DEEPSEEK_API_KEY?.trim()
      : environment.MOONSHOT_API_KEY?.trim();
  if (!apiKey) return null;

  return {
    requestedModelId,
    profile: effectiveProfile,
    apiKey,
    apiUrl:
      effectiveProfile.provider === "deepseek"
        ? environment.DEEPSEEK_API_URL?.trim() ||
          "https://api.deepseek.com/v1/chat/completions"
        : environment.MOONSHOT_API_URL?.trim() ||
          "https://api.moonshot.ai/v1/chat/completions",
    fellBack: effectiveProfile.id !== requestedModelId,
  };
}

function fallbackProfile(
  availability: ConciergeProviderAvailability,
): ConciergeModelProfile | null {
  const preferredIds: readonly ConciergeModelId[] = [
    DEFAULT_CONCIERGE_MODEL_ID,
    "kimi-k2.6",
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
