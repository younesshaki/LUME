import "server-only";
import type { ConciergeModelId } from "./conciergeModels";
import {
  isModelConfiguredInEnvironment,
  providerAvailabilityFromEnvironment,
  resolveChatProviderFromEnvironment,
  type ConciergeProviderAvailability,
  type ResolvedChatProvider,
} from "./chatProviderResolution";

export type {
  ConciergeProviderAvailability,
  ResolvedChatProvider,
} from "./chatProviderResolution";

export function getConciergeProviderAvailability(): ConciergeProviderAvailability {
  return providerAvailabilityFromEnvironment(process.env);
}

export function isConciergeModelConfigured(
  modelId: ConciergeModelId,
): boolean {
  return isModelConfiguredInEnvironment(modelId, process.env);
}

/**
 * Use the tenant's selected model when its provider is configured. If an
 * environment secret is removed after selection, preserve public chat
 * availability with the cheapest configured profile and report fellBack.
 */
export function resolveChatProvider(
  configuredModel: unknown,
): ResolvedChatProvider | null {
  return resolveChatProviderFromEnvironment(configuredModel, process.env);
}
