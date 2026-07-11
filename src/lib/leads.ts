import type { LeadCaptureInput, LeadCaptureResponse } from "@lume/types";
import { publicTenantSlug } from "./publicTenant";
import { getLeadAttribution } from "./leadAttribution";

const LEADS_API_PATH = "/api/leads";
const ADMIN_API_HOST = (import.meta.env.VITE_ADMIN_API_HOST as string | undefined)?.replace(/\/$/, "");

export async function submitLead(input: LeadCaptureInput): Promise<LeadCaptureResponse> {
  const attribution = getLeadAttribution({
    utmSource: input.utmSource,
    utmMedium: input.utmMedium,
    utmCampaign: input.utmCampaign,
    utmContent: input.utmContent,
    referrer: input.referrer,
  });
  const response = await fetch(createLeadsApiUrl(), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Lume-Tenant": publicTenantSlug,
    },
    body: JSON.stringify({ ...input, ...attribution }),
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const payload = (await response.json()) as { error?: string };
      message = payload.error || message;
    } catch {
      // keep status text
    }
    throw new Error(message || "Unable to submit lead.");
  }

  return (await response.json()) as LeadCaptureResponse;
}

export function createLeadsApiUrl(): string {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "http://localhost";
  const url = new URL(`${ADMIN_API_HOST ?? ""}${LEADS_API_PATH}`, origin);
  url.searchParams.set("tenant", publicTenantSlug);
  return ADMIN_API_HOST ? url.toString() : `${url.pathname}${url.search}`;
}
