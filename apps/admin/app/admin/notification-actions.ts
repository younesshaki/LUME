"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@lume/db/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type NotificationActionResult = { error?: string };

export async function markAdminNotificationRead(
  tenantId: string,
  notificationId: string,
): Promise<NotificationActionResult> {
  if (!tenantId || !notificationId) return { error: "Invalid notification." };

  try {
    const supabase = await createSupabaseServerClient();
    const [{ data: notification, error: notificationError }, userResult] = await Promise.all([
      supabase
        .from("admin_notifications")
        .select("id, read_at")
        .eq("tenant_id", tenantId)
        .eq("id", notificationId)
        .maybeSingle(),
      supabase.auth.getUser(),
    ]);
    if (!userResult.data.user) return { error: "Sign in to manage notifications." };
    if (notificationError || !notification) return { error: "Notification not found." };
    if (notification.read_at) return {};

    const { error } = await createServiceClient()
      .from("admin_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("id", notificationId)
      .is("read_at", null);
    if (error) return { error: "Unable to mark the notification as read." };

    revalidatePath("/admin", "layout");
    return {};
  } catch {
    return { error: "Notifications are not configured on this environment." };
  }
}

export async function markAllAdminNotificationsRead(
  tenantId: string,
): Promise<NotificationActionResult> {
  if (!tenantId) return { error: "Invalid tenant." };

  try {
    const supabase = await createSupabaseServerClient();
    const [{ data: tenant, error: tenantError }, userResult] = await Promise.all([
      supabase.from("tenants").select("id").eq("id", tenantId).maybeSingle(),
      supabase.auth.getUser(),
    ]);
    const user = userResult.data.user;
    if (!user) return { error: "Sign in to manage notifications." };
    if (tenantError || !tenant) return { error: "Tenant not found." };

    const { error } = await createServiceClient()
      .from("admin_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .is("read_at", null)
      .or(`user_id.is.null,user_id.eq.${user.id}`);
    if (error) return { error: "Unable to mark notifications as read." };

    revalidatePath("/admin", "layout");
    return {};
  } catch {
    return { error: "Notifications are not configured on this environment." };
  }
}
