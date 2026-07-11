import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@lume/db";
import type { ToolSpec } from "@lume/bot";

type DbClient = SupabaseClient<Database, "public">;

export type ToolRequestFields =
  | Record<string, never>
  | { tools: ToolSpec[]; tool_choice: "auto" };

/** Missing row preserves legacy all-tools behavior; read errors fail closed. */
export function resolveTenantToolAllowlist(
  row: { allowed_tools: unknown } | null,
  error: unknown,
): string[] | undefined {
  if (error) return [];
  if (!row) return undefined;
  if (!Array.isArray(row.allowed_tools)) return [];
  return row.allowed_tools.filter((name): name is string => typeof name === "string");
}

export async function loadTenantToolAllowlist(
  client: DbClient,
  tenantId: string,
): Promise<string[] | undefined> {
  try {
    const { data, error } = await client
      .from("tenant_bot_config")
      .select("allowed_tools")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    return resolveTenantToolAllowlist(data, error);
  } catch {
    return [];
  }
}

/** Omit both DeepSeek fields when the tenant has no callable tools. */
export function buildToolRequestFields(specs: ToolSpec[]): ToolRequestFields {
  return specs.length > 0 ? { tools: specs, tool_choice: "auto" } : {};
}
