/**
 * Server-only RAG retrieval. Embeds the query, runs a tenant-scoped pgvector
 * similarity search, and returns ranked chunks. Combine with `assembleSystemPrompt`
 * from the package root to build the final system prompt.
 *
 * Embedding is pluggable so we can swap Ollama for OpenAI/Voyage/etc. per
 * deployment without touching call sites. The default embedder calls a local
 * (or remote) Ollama server using the same `nomic-embed-text` model the
 * existing `scripts/generateEmbeddings.ts` uses.
 */
import type { RetrievedChunk, TenantId } from "@lume/types";
import type { ServerSupabaseClient } from "@lume/db/server";

export type Embedder = (text: string) => Promise<number[]>;

export type OllamaEmbedderOptions = {
  host?: string;
  model?: string;
};

/**
 * Default embedder: calls Ollama's /api/embeddings.
 * Reads OLLAMA_HOST and OLLAMA_EMBED_MODEL from env if not provided.
 */
export function createOllamaEmbedder(
  opts: OllamaEmbedderOptions = {},
): Embedder {
  const host = opts.host ?? process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
  const model =
    opts.model ?? process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text";
  const url = `${host.replace(/\/$/, "")}/api/embeddings`;

  return async (text: string): Promise<number[]> => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(
        `[@lume/rag] Embedding failed: ${res.status} ${res.statusText}`,
      );
    }
    const data = (await res.json()) as { embedding?: unknown };
    if (
      !Array.isArray(data.embedding) ||
      !data.embedding.every(Number.isFinite)
    ) {
      throw new Error(
        "[@lume/rag] Embedding response did not contain a finite vector",
      );
    }
    return data.embedding as number[];
  };
}

export type RetrieveOptions = {
  client: ServerSupabaseClient;
  tenantId: TenantId;
  query: string;
  embed: Embedder;
  topK?: number;
  /**
   * Minimum similarity (0..1, cosine). Chunks below this are dropped.
   * Tune per tenant; default is permissive.
   */
  minScore?: number;
};

export type HybridRetrieveOptions = {
  client: ServerSupabaseClient;
  tenantId: TenantId;
  query: string;
  /** Optional during the local-Ollama transition; lexical retrieval remains available. */
  embed?: Embedder | null;
  topK?: number;
};

/**
 * Visibility-safe hybrid retrieval. The database fuses FTS and vector ranks
 * only across the currently published revision. If embedding is unavailable,
 * the exact same RPC degrades to lexical search rather than fetching the whole
 * tenant corpus into a serverless function.
 */
export async function retrieveHybridContext(
  opts: HybridRetrieveOptions,
): Promise<RetrievedChunk[]> {
  const { client, tenantId, query, embed = null, topK = 7 } = opts;
  let embedding: number[] | null = null;
  if (embed) {
    try {
      const candidate = await embed(query);
      embedding =
        candidate.length === 768 && candidate.every(Number.isFinite)
          ? candidate
          : null;
    } catch {
      embedding = null;
    }
  }
  const { data, error } = await client.rpc("hybrid_rag_chunks_for_tenant", {
    p_tenant_id: tenantId,
    p_query_text: query,
    p_query_embedding: embedding,
    p_match_count: topK,
  });
  if (error) {
    throw new Error(`[@lume/rag] hybrid search failed: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    chunkId: row.id,
    text: row.text,
    category: row.category,
    score: row.score,
    documentId: row.document_id,
    documentTitle: row.document_title,
    documentRevision: row.document_revision,
    publishedAt: row.published_at,
    retrievalSource: row.source,
  }));
}

/**
 * Tenant-scoped semantic retrieval.
 *
 * Uses pgvector's `<=>` cosine distance operator. Distance is in [0, 2];
 * similarity = 1 - distance, normalized to [0, 1] for the caller.
 *
 * Note: the .rpc('match_rag_chunks') style is cleaner but requires a
 * dedicated SQL function. We use a direct query here so the migration
 * stays minimal — easy to swap for an RPC later.
 */
export async function retrieveContext(
  opts: RetrieveOptions,
): Promise<RetrievedChunk[]> {
  const { client, tenantId, query, embed, topK = 7, minScore = 0 } = opts;
  const embedding = await embed(query);

  const { data, error } = await client.rpc(
    "match_rag_chunks_for_tenant" as never,
    {
      p_tenant_id: tenantId,
      p_query_embedding: embedding,
      p_match_count: topK,
    } as never,
  );

  if (error) {
    throw new Error(`[@lume/rag] pgvector search failed: ${error.message}`);
  }

  const rows = (data ?? []) as Array<{
    text: string;
    category: string;
    similarity: number;
  }>;

  return rows
    .filter((r) => r.similarity >= minScore)
    .map((r) => ({
      text: r.text,
      category: r.category,
      score: r.similarity,
    }));
}
