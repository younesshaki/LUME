import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { countChunksByDocument, rowToKnowledgeDocument } from "./knowledge";

const client = readFileSync(
  resolve(
    process.cwd(),
    "apps/admin/app/admin/[tenant]/knowledge/KnowledgeClient.tsx",
  ),
  "utf8",
);

describe("knowledge admin lifecycle", () => {
  it("uses tenant-scoped lifecycle RPCs instead of destructive deletes", () => {
    expect(client).toContain('"save_rag_document"');
    expect(client).toContain('"enqueue_rag_indexing_job"');
    expect(client).toContain('"archive_rag_document"');
    expect(client).toContain("p_tenant_id: tenantId");
    expect(client).not.toContain('.from("rag_documents").delete()');
  });

  it("shows revision, publication, indexing and failure state", () => {
    expect(client).toContain("document.revision");
    expect(client).toContain("document.publishedRevision");
    expect(client).toContain("document.embeddingStatus");
    expect(client).toContain("document.indexingError");
  });

  it("maps lifecycle records without dropping publication metadata", () => {
    const document = rowToKnowledgeDocument(
      {
        id: "doc",
        tenant_id: "tenant",
        title: "Returns",
        category: "policy",
        source: null,
        content: "Returns are reviewed individually.",
        status: "published",
        visibility: "public",
        revision: 4,
        published_revision: 3,
        published_at: "2026-09-01T00:00:00.000Z",
        embedding_status: "pending",
        embedding_model: "nomic-embed-text",
        indexed_at: "2026-08-31T00:00:00.000Z",
        indexing_error: null,
        created_at: "2026-08-01T00:00:00.000Z",
        updated_at: "2026-09-02T00:00:00.000Z",
      },
      6,
    );
    expect(document).toMatchObject({
      revision: 4,
      publishedRevision: 3,
      embeddingStatus: "pending",
      chunkCount: 6,
    });
  });

  it("counts only the coherent published revision", () => {
    const counts = countChunksByDocument(
      [
        { document_id: "doc", revision: 1 },
        { document_id: "doc", revision: 2 },
        { document_id: "doc", revision: 2 },
      ],
      new Map([["doc", 2]]),
    );
    expect(counts.get("doc")).toBe(2);
  });
});
