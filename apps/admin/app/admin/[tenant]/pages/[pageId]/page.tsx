import { notFound } from "next/navigation";
import { fetchDraftPage, listPageRevisions } from "@lume/db";
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
  const revisions = await listPageRevisions(supabase, pageId, tenant.id);

  const publicSiteBaseUrl =
    process.env.NEXT_PUBLIC_PUBLIC_SITE_URL ?? "https://lume-jade-three.vercel.app";

  return (
    <PageEditorClient
      tenantId={tenant.id}
      tenantSlug={tenant.slug}
      publicSiteBaseUrl={publicSiteBaseUrl}
      page={{
        id: draft.page.id,
        slug: draft.page.slug,
        title: draft.page.title,
        draftRevisionId: draft.page.draftRevisionId,
        publishedRevisionId: draft.page.publishedRevisionId,
      }}
      initialBlocks={draft.blocks}
      initialRevisions={revisions}
      blockDescriptors={listEditorBlockDescriptors()}
    />
  );
}
