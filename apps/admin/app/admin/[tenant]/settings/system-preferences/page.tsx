import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SystemPreferencesClient } from "./SystemPreferencesClient";

type PageProps = { params: Promise<{ tenant: string }> };

export default async function SystemPreferencesPage({ params }: PageProps) {
  const { tenant: slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) notFound();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  const { data: preference } = await supabase
    .from("tenant_member_preferences")
    .select("sidebar_single_expand")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <PageHeader
        title="System preferences"
        description={`Personal Admin preferences for ${tenant.name}.`}
      />
      <SystemPreferencesClient
        slug={slug}
        initialSidebarSingleExpand={preference?.sidebar_single_expand ?? true}
      />
    </div>
  );
}
