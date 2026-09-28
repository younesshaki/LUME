import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadTenantAdminMetadata } from "@/lib/tenantAdminMetadata";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
};

/** The tenant's own favicon in the browser tab while its admin is open. */
export async function generateMetadata({ params }: Pick<LayoutProps, "params">): Promise<Metadata> {
  const { tenant } = await params;
  return loadTenantAdminMetadata(await createSupabaseServerClient(), tenant);
}

export default function TenantAdminLayout({ children }: LayoutProps) {
  return children;
}
