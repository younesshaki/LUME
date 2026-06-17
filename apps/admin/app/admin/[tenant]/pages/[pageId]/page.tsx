import { notFound } from "next/navigation";
import { fetchDraftPage } from "@lume/db";
import { listEditorBlockDescriptors } from "@lume/blocks";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import PageEditorClient from "./PageEditorClient";

type PageProps = { params: Promise<{ tenant: string; pageId: string }> };

export default async function PageEditorPage({ params }: PageProps) {
  const { tenant: slug, pageId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  const draft = await fetchDraftPage(supabase, pageId);
  if (!draft || draft.page.tenantId !== tenant.id) notFound();

  return (
    <PageEditorClient
      tenantId={tenant.id}
      tenantSlug={tenant.slug}
      page={{
        id: draft.page.id,
        slug: draft.page.slug,
        title: draft.page.title,
      }}
      initialBlocks={draft.blocks}
      blockDescriptors={listEditorBlockDescriptors()}
    />
  );
}
