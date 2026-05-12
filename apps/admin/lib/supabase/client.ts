/**
 * Supabase client for Client Components. Reads NEXT_PUBLIC_* env which is
 * inlined at build time. RLS still applies — the browser can only see what
 * the logged-in user is allowed to see.
 */
"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@lume/db";

export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
