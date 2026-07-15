import type { LeadSource, LeadSourceContext } from "@lume/types";

export type NormalizedLeadCapture = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  vehicleId: string | null;
  source: Extract<LeadSource, "chat" | "contact-form" | "test-drive" | "api">;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  referrer: string | null;
  sourceContext: LeadSourceContext | null;
  turnstileToken: string | null;
};

export type LeadCaptureValidation =
  | { ok: true; value: NormalizedLeadCapture }
  | { ok: false; error: string };

const ALLOWED_PUBLIC_SOURCES = new Set(["chat", "contact-form", "test-drive", "api"]);

export function normalizeLeadCaptureInput(input: unknown): LeadCaptureValidation {
  if (!isRecord(input)) return { ok: false, error: "Request body must be an object." };

  const email = nullableTrimmed(input.email, 160);
  const phone = nullableTrimmed(input.phone, 60);
  if (!email && !phone) {
    return { ok: false, error: "Email or phone is required." };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Email is invalid." };
  }

  const source = normalizeSource(input.source);
  return {
    ok: true,
    value: {
      firstName: nullableTrimmed(input.firstName, 120) ?? "",
      lastName: nullableTrimmed(input.lastName, 120) ?? "",
      email,
      phone,
      message: nullableTrimmed(input.message, 2_000),
      vehicleId: nullableTrimmed(input.vehicleId, 80),
      source,
      utmSource: nullableTrimmed(input.utmSource, 120),
      utmMedium: nullableTrimmed(input.utmMedium, 120),
      utmCampaign: nullableTrimmed(input.utmCampaign, 120),
      utmContent: nullableTrimmed(input.utmContent, 120),
      referrer: nullableTrimmed(input.referrer, 2_048),
      sourceContext: normalizeSourceContext(input.sourceContext, source),
      turnstileToken: nullableTrimmed(input.turnstileToken, 2_048),
    },
  };
}

type TurnstileVerification = {
  success: boolean;
  "error-codes"?: string[];
};

type VerifyTurnstileOptions = {
  secret: string;
  token: string;
  remoteIp?: string | null;
  fetcher?: typeof fetch;
};

/** Server-side Turnstile verification. Secrets never cross the API boundary. */
export async function verifyTurnstileToken({
  secret,
  token,
  remoteIp,
  fetcher = fetch,
}: VerifyTurnstileOptions): Promise<boolean> {
  if (!secret || !token || token.length > 2_048) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetcher(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
          response: token,
          ...(remoteIp ? { remoteip: remoteIp } : {}),
          idempotency_key: crypto.randomUUID(),
        }),
        signal: controller.signal,
      }
    );
    if (!response.ok) return false;
    const result = (await response.json()) as TurnstileVerification;
    return result.success === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeSource(value: unknown): NormalizedLeadCapture["source"] {
  return typeof value === "string" && ALLOWED_PUBLIC_SOURCES.has(value)
    ? (value as NormalizedLeadCapture["source"])
    : "contact-form";
}

function normalizeSourceContext(
  value: unknown,
  source: NormalizedLeadCapture["source"],
): LeadSourceContext | null {
  if (!isRecord(value)) return null;

  if (source === "chat" && value.trigger === "bot-action") {
    if (value.actionType !== "capture_lead" && value.actionType !== "open-lead-form") {
      return null;
    }
    const vehicleId = nullableTrimmed(value.vehicleId, 80);
    return {
      trigger: "bot-action",
      actionType: value.actionType,
      ...(vehicleId ? { vehicleId } : {}),
    };
  }

  if (
    (source === "contact-form" || source === "test-drive") &&
    value.trigger === "vehicle-detail" &&
    value.actionType === "request-info"
  ) {
    const vehicleId = nullableTrimmed(value.vehicleId, 80);
    if (!vehicleId) return null;
    const vehicleTitle = nullableTrimmed(value.vehicleTitle, 240);
    const pagePath = nullableTrimmed(value.pagePath, 2_048);
    return {
      trigger: "vehicle-detail",
      actionType: "request-info",
      vehicleId,
      ...(vehicleTitle ? { vehicleTitle } : {}),
      ...(pagePath ? { pagePath } : {}),
    };
  }

  return null;
}

function nullableTrimmed(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
