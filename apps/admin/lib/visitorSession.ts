/**
 * Visitor session plumbing (SCRUM-128): cookie build/read, session resolution,
 * and a credentials-aware CORS helper for the cross-origin public site.
 */
import type { Visitor } from "@lume/types";
import { createServiceClient } from "@lume/db/server";
import { corsHeadersFor } from "@/lib/origin";
import { hashSessionToken } from "@/lib/visitorAuth";
import { toPublicVisitor } from "./visitorPublic";

export const VISITOR_COOKIE = "lume_visitor_session";

export { toPublicVisitor } from "./visitorPublic";

/**
 * Cross-origin cookie: the public site lives on a different origin than the
 * API, so the cookie must be SameSite=None; Secure to be sent at all.
 */
export function buildSessionCookie(token: string, expiresAt: Date): string {
  return [
    `${VISITOR_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=None",
    `Expires=${expiresAt.toUTCString()}`,
  ].join("; ");
}

export function clearSessionCookie(): string {
  return [
    `${VISITOR_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=None",
    "Max-Age=0",
  ].join("; ");
}

export function readSessionToken(request: Request): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === VISITOR_COOKIE) return rest.join("=") || null;
  }
  return null;
}

/**
 * Resolve the signed-in visitor for this request within a tenant, or null.
 * Validates the session token hash, tenant scope, and expiry.
 */
export async function resolveVisitor(
  request: Request,
  tenantId: string,
  supabase = createServiceClient(),
): Promise<Visitor | null> {
  const token = readSessionToken(request);
  if (!token) return null;

  const { data: session } = await supabase
    .from("visitor_sessions")
    .select("visitor_id, expires_at")
    .eq("tenant_id", tenantId)
    .eq("token_hash", hashSessionToken(token))
    .maybeSingle();

  if (!session || new Date(session.expires_at).getTime() <= Date.now()) return null;

  const { data: visitor } = await supabase
    .from("visitors")
    .select("id, tenant_id, email, first_name, last_name, created_at")
    .eq("tenant_id", tenantId)
    .eq("id", session.visitor_id)
    .maybeSingle();

  return visitor ? toPublicVisitor(visitor) : null;
}

/** CORS headers that additionally permit credentialed (cookie) requests. */
export function visitorCorsHeaders(request: Request): Record<string, string> {
  const base = corsHeadersFor(request);
  if (Object.keys(base).length === 0) return base;
  return { ...base, "Access-Control-Allow-Credentials": "true" };
}
