import { isAllowedWebhookEndpoint } from "@lume/db";

export type CrmIntegrationKind = "hubspot" | "pipedrive" | "custom";

export function isCrmIntegrationKind(value: string): value is CrmIntegrationKind {
  return value === "hubspot" || value === "pipedrive" || value === "custom";
}

export function parseWebhookRetrySeconds(value: string): number[] | null {
  const parts = value.split(",").map((part) => Number(part.trim()));
  return parts.length >= 1 && parts.length <= 10 &&
    parts.every((part) => Number.isSafeInteger(part) && part >= 1 && part <= 86_400)
    ? parts
    : null;
}

export function validateCrmWebhookInput(input: {
  name: string;
  endpointUrl: string;
  integrationKind: string;
  retryDelays: string;
}): { ok: true; value: {
  name: string;
  endpointUrl: string;
  integrationKind: CrmIntegrationKind;
  retryDelaysSeconds: number[];
} } | { ok: false; error: string } {
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 100);
  if (!name) return { ok: false, error: "Give the integration a name." };
  const endpointUrl = input.endpointUrl.trim();
  if (!isAllowedWebhookEndpoint(endpointUrl)) {
    return { ok: false, error: "Use a public HTTPS webhook URL without credentials." };
  }
  if (!isCrmIntegrationKind(input.integrationKind)) {
    return { ok: false, error: "Choose a supported CRM type." };
  }
  const retryDelaysSeconds = parseWebhookRetrySeconds(input.retryDelays);
  if (!retryDelaysSeconds) {
    return { ok: false, error: "Retry delays must be 1–10 comma-separated seconds between 1 and 86400." };
  }
  return { ok: true, value: { name, endpointUrl, integrationKind: input.integrationKind, retryDelaysSeconds } };
}
