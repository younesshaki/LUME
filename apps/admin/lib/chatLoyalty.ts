import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveTier, LOYALTY_EVENT_POINTS, type Database } from "@lume/db";
import type { Visitor } from "@lume/types";

type DbClient = SupabaseClient<Database, "public">;

export type ChatLoyaltyContext = {
  points: number;
  tier: { name: string; threshold: number } | null;
};

export async function loadChatLoyaltyContext(
  client: DbClient,
  tenantId: string,
  visitor: Pick<Visitor, "id" | "email">,
): Promise<ChatLoyaltyContext | null> {
  try {
    const [accountResult, tiersResult] = await Promise.all([
      client
        .from("loyalty_accounts")
        .select("points_balance")
        .eq("tenant_id", tenantId)
        .eq("visitor_id", visitor.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      client
        .from("loyalty_tiers")
        .select("name, threshold")
        .eq("tenant_id", tenantId),
    ]);
    if (tiersResult.error) return null;

    let account = accountResult.data;
    if (accountResult.error || !account) {
      const fallback = await client
        .from("loyalty_accounts")
        .select("points_balance")
        .eq("tenant_id", tenantId)
        .eq("email", visitor.email)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fallback.error) return null;
      account = fallback.data;
    }

    const points = Math.max(0, Math.floor(account?.points_balance ?? 0));
    return { points, tier: deriveTier(tiersResult.data ?? [], points) };
  } catch {
    return null;
  }
}

export function loyaltySystemPrompt(context: ChatLoyaltyContext | null): string {
  if (!context) return "";
  const tierName = context.tier ? sanitizePromptValue(context.tier.name) : "No tier yet";
  return [
    "",
    "---",
    "=== SIGNED-IN VISITOR LOYALTY (trusted server data) ===",
    `Current balance: ${Math.max(0, Math.floor(context.points))} points`,
    `Current tier: ${JSON.stringify(tierName)}`,
    "Use this only when relevant. Naturally acknowledge Gold or Platinum status, but never invent benefits or eligibility not stated elsewhere in trusted context.",
    "For lower/no-tier visitors, gently mention point-earning actions only when helpful; never pressure them.",
    `Currently wired earning action: submit an inquiry +${LOYALTY_EVENT_POINTS.submitted_lead}. Do not advertise saved-vehicle, referral, or chat-session awards until their producers are connected.`,
    "Do not reveal or infer visitor identifiers, contact details, or transaction history.",
    "=======================================================",
  ].join("\n");
}

function sanitizePromptValue(value: string): string {
  return value.replace(/[\r\n\t\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "No tier yet";
}
