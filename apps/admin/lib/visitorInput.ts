/**
 * Validation for the public visitor auth endpoints (SCRUM-128/129). Kept
 * separate from the routes so it's unit-testable and shared by signup + login.
 */
export type ParsedSignup = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
};

export type ParsedLogin = { email: string; password: string };

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;

function record(body: unknown): Record<string, unknown> | null {
  return typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

function cleanEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return EMAIL_RE.test(email) && email.length <= 320 ? email : null;
}

function cleanName(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

export function parseSignupInput(body: unknown): Result<ParsedSignup> {
  const r = record(body);
  if (!r) return { ok: false, error: "Expected a JSON object." };
  const email = cleanEmail(r.email);
  if (!email) return { ok: false, error: "A valid email is required." };
  const password = typeof r.password === "string" ? r.password : "";
  if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
    return { ok: false, error: `Password must be ${MIN_PASSWORD}-${MAX_PASSWORD} characters.` };
  }
  return {
    ok: true,
    value: { email, password, firstName: cleanName(r.firstName), lastName: cleanName(r.lastName) },
  };
}

export function parseLoginInput(body: unknown): Result<ParsedLogin> {
  const r = record(body);
  if (!r) return { ok: false, error: "Expected a JSON object." };
  const email = cleanEmail(r.email);
  const password = typeof r.password === "string" ? r.password : "";
  if (!email || !password) return { ok: false, error: "Email and password are required." };
  return { ok: true, value: { email, password } };
}
