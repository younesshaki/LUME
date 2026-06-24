import { notFound } from "next/navigation";
import type { Database } from "@lume/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  countChunksByDocument,
  rowToKnowledgeDocument,
} from "@/lib/knowledge";
import KnowledgeClient from "./KnowledgeClient";

type PageProps = {
  params: Promise<{ tenant: string }>;
};

type RagDocumentRow = Database["public"]["Tables"]["rag_documents"]["Row"];
type RagChunkRow = Pick<
  Database["public"]["Tables"]["rag_chunks"]["Row"],
  "document_id"
>;

export default async function KnowledgePage({ params }: PageProps) {
  const { tenant: slug } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  const { data: documents, error: documentsError } = await supabase
    .from("rag_documents")
    .select("*")
    .eq("tenant_id", tenant.id)
    .order("updated_at", { ascending: false });

  if (documentsError) {
    throw new Error(`Unable to load knowledge documents: ${documentsError.message}`);
  }

  const { data: chunks, error: chunksError } = await supabase
    .from("rag_chunks")
    .select("document_id")
    .eq("tenant_id", tenant.id);

  if (chunksError) {
    throw new Error(`Unable to load knowledge chunks: ${chunksError.message}`);
  }

  const chunkCounts = countChunksByDocument((chunks ?? []) as RagChunkRow[]);

  return (
    <KnowledgeClient
      tenantId={tenant.id}
      tenantSlug={tenant.slug}
      tenantName={tenant.name}
      initialDocuments={((documents ?? []) as RagDocumentRow[]).map((document) =>
        rowToKnowledgeDocument(document, chunkCounts.get(document.id) ?? 0)
      )}
    />
  );
}
