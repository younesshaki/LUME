/**
 * Request parsing for the GDPR data-subject endpoints. Keeps the route handlers
 * thin: they resolve tenant + origin, then hand the body here for validation
 * before calling the `@lume/db` gdpr helpers.
 */
import type { VisitorIdentifier } from "@lume/db";

export type GdprRequestValidation =
  | { ok: true; identifier: VisitorIdentifier }
  | { ok: false; error: string };

function trimmedOrNull(value: unknown, max = 320): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/** Accepts `{ email?, phone? }`; requires at least one contactable field. */
export function parseGdprRequest(body: unknown): GdprRequestValidation {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Expected a JSON object with email or phone." };
  }
  const record = body as Record<string, unknown>;
  const email = trimmedOrNull(record.email);
  const phone = trimmedOrNull(record.phone, 64);
  if (!email && !phone) {
    return { ok: false, error: "Provide an email or phone number to identify the request." };
  }
  return { ok: true, identifier: { email, phone } };
}
