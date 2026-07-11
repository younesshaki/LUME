/**
 * Tenant API keys (SCRUM-106). Server-only.
 *
 * Raw keys look like `lume_sk_<64 hex>`; only their SHA-256 is stored, so the
 * raw value exists exactly once — in the creation response. Verification
 * hashes the presented key and looks it up with the service-role client
 * (public API callers have no Supabase session), checking tenant scope,
 * revocation, and the requested permission scope.
 */
import { createHash, randomBytes } from "node:crypto";
import { createServiceClient } from "@lume/db/server";

export const API_KEY_PREFIX = "lume_sk_";
export const API_KEY_SCOPES = ["leads:write", "vehicles:read"] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export type GeneratedApiKey = {
  /** Full key — surface once, never persist. */
  rawKey: string;
  /** SHA-256 hex of the full key, for storage. */
  keyHash: string;
  /** Display fragment, e.g. "lume_sk_ab12". */
  keyPrefix: string;
};

export function generateApiKey(): GeneratedApiKey {
  const rawKey = `${API_KEY_PREFIX}${randomBytes(32).toString("hex")}`;
  return {
    rawKey,
    keyHash: hashApiKey(rawKey),
    keyPrefix: rawKey.slice(0, API_KEY_PREFIX.length + 4),
  };
}

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function isApiKeyScope(value: string): value is ApiKeyScope {
  return (API_KEY_SCOPES as readonly string[]).includes(value);
}

/** Bearer token from an Authorization header, if it looks like one of ours. */
export function apiKeyFromRequest(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.startsWith(API_KEY_PREFIX) ? token : null;
}

export type VerifiedApiKey = {
  tenantId: string;
  keyId: string;
  scopes: string[];
};

/**
 * Verify a raw key and require one scope. Returns null for unknown, revoked,
 * or under-scoped keys — callers treat null as 401/403. Updates last_used_at
 * best-effort (a failed touch never blocks the request).
 */
export async function verifyTenantApiKey(
  rawKey: string,
  requiredScope: ApiKeyScope,
): Promise<VerifiedApiKey | null> {
  const supabase = createServiceClient();
  const { data: row } = await supabase
    .from("tenant_api_keys")
    .select("id, tenant_id, scopes, revoked_at")
    .eq("key_hash", hashApiKey(rawKey))
    .maybeSingle();

  if (!row || row.revoked_at !== null || !row.scopes.includes(requiredScope)) return null;

  await supabase
    .from("tenant_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id)
    .then(() => undefined, () => undefined);

  return { tenantId: row.tenant_id, keyId: row.id, scopes: row.scopes };
}
