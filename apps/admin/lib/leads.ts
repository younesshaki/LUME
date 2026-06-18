import type { LeadCaptureInput, LeadSource } from "@lume/types";

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
    },
  };
}

function normalizeSource(value: unknown): NormalizedLeadCapture["source"] {
  return typeof value === "string" && ALLOWED_PUBLIC_SOURCES.has(value)
    ? (value as NormalizedLeadCapture["source"])
    : "contact-form";
}

function nullableTrimmed(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed || null;
}

function isRecord(value: unknown): value is LeadCaptureInput {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
