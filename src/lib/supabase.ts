import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn(
    "[supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing. Using local preview mode."
  );
}

/**
 * Public browser Supabase client. This must only ever use the anon key; public
 * reads rely on RLS/RPC boundaries and never on service-role credentials.
 */
export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : "http://127.0.0.1:54321",
  isSupabaseConfigured ? supabaseAnonKey : "local-preview-anon-key"
);
