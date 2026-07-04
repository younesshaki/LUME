/**
 * Browser-side Supabase client (anon key only). Reads only what RLS allows.
 * For Vite consumers that read env via `import.meta.env`, pass the values in
 * explicitly so this file stays runtime-agnostic.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./schema";

export type BrowserSupabaseClient = SupabaseClient<Database, "public">;

export function createBrowserClient(opts: {
  url: string;
  anonKey: string;
}): BrowserSupabaseClient {
  if (!opts.url || !opts.anonKey) {
    throw new Error(
      "[@lume/db] createBrowserClient requires url and anonKey. " +
        "Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or NEXT_PUBLIC_*) are set."
    );
  }
  return createClient<Database>(opts.url, opts.anonKey);
}
