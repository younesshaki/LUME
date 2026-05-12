/**
 * Supabase client for Server Components, Route Handlers, and Server Actions.
 * Reads the user's session from cookies; respects RLS as that user.
 *
 * For trusted server-only operations that need to bypass RLS (e.g. admin
 * provisioning a new tenant, background jobs), use createServiceClient()
 * from @lume/db/server instead.
 */
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

type CookieToSet = {
  name: string;
  value: string;
  options?: Parameters<Awaited<ReturnType<typeof cookies>>["set"]>[2];
};

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing SUPABASE_URL / SUPABASE_ANON_KEY (or NEXT_PUBLIC_* variants)."
    );
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        // In Server Components, cookieStore is read-only — calls will throw.
        // That's fine: the middleware refreshes the session on every request,
        // so Server Components can always read but not write.
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          /* read-only context — safe to ignore */
        }
      },
    },
  });
}
