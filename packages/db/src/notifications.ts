import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./schema";

type DbClient = SupabaseClient<Database, "public">;
type NotificationInsert = Database["public"]["Tables"]["admin_notifications"]["Insert"];

export type AdminNotificationInput = {
  tenantId: string;
  userId?: string | null;
  type: NotificationInsert["type"];
  body: string;
  link?: string | null;
  dedupeKey?: string | null;
};

export function buildAdminNotificationInsert(
  input: AdminNotificationInput,
): NotificationInsert | null {
  const tenantId = input.tenantId.trim();
  const body = input.body.trim().replace(/\s+/g, " ").slice(0, 500);
  const link = input.link?.trim() || null;
  const dedupeKey = input.dedupeKey?.trim() || null;
  if (
    !tenantId ||
    !body ||
    (link !== null && !isSafeAdminNotificationLink(link)) ||
    (dedupeKey !== null && !isSafeNotificationDedupeKey(dedupeKey))
  ) {
    return null;
  }
  return {
    tenant_id: tenantId,
    user_id: input.userId?.trim() || null,
    type: input.type,
    body,
    link,
    dedupe_key: dedupeKey,
  };
}

export function isSafeAdminNotificationLink(link: string): boolean {
  return link.startsWith("/admin/") && link.length <= 2_048 && !link.startsWith("//");
}

export function isSafeNotificationDedupeKey(value: string): boolean {
  return value.length <= 200 && /^[a-zA-Z0-9:._-]+$/.test(value);
}

/** Best-effort producer for future domain/quota integrations. */
export async function createAdminNotification(
  client: DbClient,
  input: AdminNotificationInput,
): Promise<boolean> {
  const insert = buildAdminNotificationInsert(input);
  if (!insert) return false;
  try {
    const { error } = await client.from("admin_notifications").insert(insert);
    return !error || (insert.dedupe_key !== null && error.code === "23505");
  } catch {
    return false;
  }
}
