import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chunkKnowledgeDocument,
  KNOWLEDGE_LIMITS,
  runKnowledgeIndexingJob,
  type RagIndexingJob,
} from "./knowledgeIndexing.server";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("knowledge chunking", () => {
  it("is deterministic, ordered and overlapping", () => {
    const content = Array.from(
      { length: 120 },
      (_, i) => `Policy sentence ${i}.`,
    ).join(" ");
    const first = chunkKnowledgeDocument(content, "policy");
    const second = chunkKnowledgeDocument(content, "policy");
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(1);
    expect(first.map((chunk) => chunk.index)).toEqual(
      first.map((_, index) => index),
    );
    expect(first[0]?.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects empty and oversized content safely", () => {
    expect(chunkKnowledgeDocument("   ", "general")).toEqual([]);
    expect(() =>
      chunkKnowledgeDocument(
        "x".repeat(KNOWLEDGE_LIMITS.maxContentChars + 1),
        "general",
      ),
    ).toThrow(/200,000/);
  });
});

describe("knowledge indexing worker", () => {
  it("reuses unchanged embeddings and only embeds changed chunks", async () => {
    vi.stubEnv("OLLAMA_HOST", "http://ollama.test");
    vi.stubEnv("OLLAMA_EMBED_MODEL", "nomic-embed-text");
    const vector = Array.from({ length: 768 }, () => 0.25);
    const content = `${"A".repeat(1_150)}. ${"B".repeat(1_150)}.`;
    const expected = chunkKnowledgeDocument(content, "policy");
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ embedding: vector }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const client = {
      from(table: string) {
        if (table === "rag_documents") {
          const query = {
            select: () => query,
            eq: () => query,
            maybeSingle: async () => ({
              data: {
                id: "doc",
                tenant_id: "tenant",
                content,
                category: "policy",
                revision: 2,
                status: "draft",
              },
              error: null,
            }),
          };
          return query;
        }
        const query = {
          select: () => query,
          eq: () => query,
          in: () => query,
          not: async () => ({
            data: [
              {
                content_hash: expected[0]?.contentHash,
                embedding: `[${vector.join(",")}]`,
              },
            ],
            error: null,
          }),
        };
        return query;
      },
      rpc,
    };
    const result = await runKnowledgeIndexingJob(client as never, job());
    expect(result).toBe("completed");
    expect(fetchMock).toHaveBeenCalledTimes(expected.length - 1);
    expect(rpc).toHaveBeenCalledWith(
      "complete_rag_indexing_job",
      expect.objectContaining({
        p_job_id: "job",
        p_embedding_model: "nomic-embed-text",
      }),
    );
  });

  it("cannot publish a superseded document revision", async () => {
    const rpc = vi.fn(async () => ({ data: false, error: null }));
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({
        data: { id: "doc", tenant_id: "tenant", revision: 3, status: "draft" },
        error: null,
      }),
    };
    const result = await runKnowledgeIndexingJob(
      { from: () => query, rpc } as never,
      job(),
    );
    expect(result).toBe("superseded");
    expect(rpc).toHaveBeenCalledWith("complete_rag_indexing_job", {
      p_job_id: "job",
      p_chunks: [],
      p_embedding_model: null,
    });
  });
});

function job(): RagIndexingJob {
  const now = new Date().toISOString();
  return {
    id: "job",
    tenant_id: "tenant",
    document_id: "doc",
    revision: 2,
    status: "processing",
    attempt_count: 1,
    next_attempt_at: now,
    claimed_at: now,
    last_error: null,
    completed_at: null,
    created_at: now,
    updated_at: now,
  };
}
