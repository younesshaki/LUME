import type { Database } from "@lume/db";
import type { RagDocument } from "@lume/types";

type RagDocumentRow = Database["public"]["Tables"]["rag_documents"]["Row"];
type RagChunkRow = Pick<
  Database["public"]["Tables"]["rag_chunks"]["Row"],
  "document_id"
>;

export type KnowledgeDocument = RagDocument & {
  updatedAt: string;
  chunkCount: number;
};

export function rowToKnowledgeDocument(
  row: RagDocumentRow,
  chunkCount: number
): KnowledgeDocument {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    title: row.title,
    category: row.category,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    chunkCount,
  };
}

export function countChunksByDocument(rows: RagChunkRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.document_id, (counts.get(row.document_id) ?? 0) + 1);
  }
  return counts;
}
