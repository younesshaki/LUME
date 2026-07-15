import type { LeadCaptureInput, LeadCaptureResponse } from "@lume/types";
import { publicTenantSlug } from "@/lib/publicTenant";

export type VehicleInquiryInput = {
  fullName: string;
  email: string;
  phone?: string;
  message?: string;
  vehicleId: string;
  vehicleTitle: string;
  turnstileToken?: string;
};

export type VehicleInquiryResult = {
  leadId: string;
  duplicate: boolean;
};

type SubmitVehicleInquiryOptions = {
  fetcher?: typeof fetch;
  tenantSlug?: string;
  pageUrl?: string;
  referrer?: string;
  timeoutMs?: number;
};

export async function submitVehicleInquiry(
  input: VehicleInquiryInput,
  {
    fetcher = fetch,
    tenantSlug = publicTenantSlug,
    pageUrl = browserPageUrl(),
    referrer = browserReferrer(),
    timeoutMs = 15_000,
  }: SubmitVehicleInquiryOptions = {},
): Promise<VehicleInquiryResult> {
  const payload = buildVehicleInquiryPayload(input, pageUrl, referrer);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetcher(`/api/leads?tenant=${encodeURIComponent(tenantSlug)}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Lume-Tenant": tenantSlug,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const responseBody = await readJson(response);
    if (!response.ok) {
      const message = isRecord(responseBody) && typeof responseBody.error === "string"
        ? responseBody.error
        : "Unable to send your inquiry. Please try again.";
      throw new Error(message);
    }

    if (!isRecord(responseBody) || typeof responseBody.leadId !== "string") {
      throw new Error("The inquiry was accepted but no confirmation was returned.");
    }

    return {
      leadId: (responseBody as LeadCaptureResponse).leadId,
      duplicate: response.status === 200,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The inquiry timed out. Please check your connection and try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function buildVehicleInquiryPayload(
  input: VehicleInquiryInput,
  pageUrl?: string,
  referrer?: string,
): LeadCaptureInput {
  const { firstName, lastName } = splitFullName(input.fullName);
  const url = safeUrl(pageUrl);
  const pagePath = url ? `${url.pathname}${url.search}` : undefined;

  return {
    firstName,
    lastName,
    email: input.email.trim(),
    phone: optionalTrim(input.phone),
    message: optionalTrim(input.message),
    vehicleId: input.vehicleId,
    source: "contact-form",
    utmSource: optionalTrim(url?.searchParams.get("utm_source") ?? undefined),
    utmMedium: optionalTrim(url?.searchParams.get("utm_medium") ?? undefined),
    utmCampaign: optionalTrim(url?.searchParams.get("utm_campaign") ?? undefined),
    utmContent: optionalTrim(url?.searchParams.get("utm_content") ?? undefined),
    referrer: optionalTrim(referrer),
    sourceContext: {
      trigger: "vehicle-detail",
      actionType: "request-info",
      vehicleId: input.vehicleId,
      vehicleTitle: input.vehicleTitle,
      ...(pagePath ? { pagePath } : {}),
    },
    turnstileToken: optionalTrim(input.turnstileToken),
  };
}

export function splitFullName(value: string): { firstName: string; lastName: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts.shift() ?? "",
    lastName: parts.join(" "),
  };
}

function optionalTrim(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function browserPageUrl(): string | undefined {
  return typeof window === "undefined" ? undefined : window.location.href;
}

function browserReferrer(): string | undefined {
  return typeof document === "undefined" ? undefined : document.referrer || undefined;
}

function safeUrl(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
