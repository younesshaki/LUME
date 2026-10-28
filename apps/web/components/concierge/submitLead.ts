import type { LeadCaptureInput, LeadCaptureResponse } from "@lume/types";
import { getLeadAttribution } from "@lume/blocks/lead-attribution";

export async function submitPublicLead(
  tenant: string,
  input: LeadCaptureInput,
  signal?: AbortSignal,
): Promise<LeadCaptureResponse> {
  const response = await fetch(
    `/api/leads?tenant=${encodeURIComponent(tenant)}`,
    {
      method: "POST",
      credentials: "include",
      signal,
      headers: { "Content-Type": "application/json", "X-Lume-Tenant": tenant },
      body: JSON.stringify({ ...input, ...getLeadAttribution(input) }),
    },
  );
  const data = await response.json();
  if (!response.ok || typeof data.leadId !== "string")
    throw new Error(
      typeof data.error === "string" ? data.error : "Unable to submit request.",
    );
  return data;
}
