/**
 * Server-side Supabase clients. Two flavors:
 *
 *   • createServiceClient() — uses the SERVICE_ROLE key. Bypasses RLS. Use for
 *     trusted server-only operations (background jobs, RAG indexing, admin
 *     mutations performed on behalf of a verified user). Never expose this
 *     client or its key to the browser.
 *
 *   • createTenantClient(opts) — anon key, but with the tenant's request
 *     context attached. RLS still enforces isolation. Use for the public
 *     site's server-side reads (e.g. /api/chat resolving a tenant's RAG
 *     chunks) where we do NOT want to bypass RLS but DO want a typed client.
 *
 * Both throw at construction time if their environment variables are missing —
 * we'd rather fail loudly at server boot than silently degrade in production.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./schema";

export type ServerSupabaseClient = SupabaseClient<Database, "public">;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[@lume/db] Missing required environment variable: ${name}. ` +
        `Add it to your Vercel project settings or .env.local before booting the server.`
    );
  }
  return value;
}

export function createServiceClient(): ServerSupabaseClient {
  const url = requireEnv("SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createAnonServerClient(): ServerSupabaseClient {
  const url = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
