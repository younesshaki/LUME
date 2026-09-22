import type { Database } from "@lume/db";
import type { RagDocument } from "@lume/types";

type RagDocumentRow = Database["public"]["Tables"]["rag_documents"]["Row"];
type RagChunkRow = Pick<
  Database["public"]["Tables"]["rag_chunks"]["Row"],
  "document_id" | "revision"
>;

export type KnowledgeDocument = RagDocument & {
  updatedAt: string;
  chunkCount: number;
};

export function rowToKnowledgeDocument(
  row: RagDocumentRow,
  chunkCount: number,
): KnowledgeDocument {
  const lifecycle = row as Partial<RagDocumentRow>;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    title: row.title,
    category: row.category,
    source: row.source,
    content: lifecycle.content ?? "",
    status: lifecycle.status ?? "draft",
    visibility: lifecycle.visibility ?? "public",
    revision: lifecycle.revision ?? 1,
    publishedRevision: lifecycle.published_revision ?? null,
    embeddingStatus: lifecycle.embedding_status ?? "not_indexed",
    embeddingModel: lifecycle.embedding_model ?? null,
    publishedAt: lifecycle.published_at ?? null,
    indexedAt: lifecycle.indexed_at ?? null,
    indexingError: lifecycle.indexing_error ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    chunkCount,
  };
}

export function countChunksByDocument(
  rows: RagChunkRow[],
  publishedRevisions: ReadonlyMap<string, number | null> = new Map(),
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const publishedRevision = publishedRevisions.get(row.document_id);
    if (publishedRevision !== undefined && row.revision !== publishedRevision) {
      continue;
    }
    counts.set(row.document_id, (counts.get(row.document_id) ?? 0) + 1);
  }
  return counts;
}
