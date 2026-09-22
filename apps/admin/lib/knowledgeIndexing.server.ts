import { createHash } from "node:crypto";
import type { Database } from "@lume/db";
import type { ServerSupabaseClient } from "@lume/db/server";
import { createOllamaEmbedder, type Embedder } from "@lume/rag/server";

export const KNOWLEDGE_LIMITS = {
  maxContentChars: 200_000,
  maxChunks: 400,
  targetChunkChars: 1_200,
  overlapChars: 180,
} as const;

export type KnowledgeIndexChunk = {
  index: number;
  externalId: string;
  text: string;
  category: string;
  contentHash: string;
  embedding?: number[];
};

export function chunkKnowledgeDocument(
  content: string,
  category: string,
): KnowledgeIndexChunk[] {
  const normalized = content.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];
  if (normalized.length > KNOWLEDGE_LIMITS.maxContentChars) {
    throw new Error("Knowledge document exceeds the 200,000 character limit.");
  }
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(
      start + KNOWLEDGE_LIMITS.targetChunkChars,
      normalized.length,
    );
    if (end < normalized.length) {
      const boundary = Math.max(
        normalized.lastIndexOf("\n\n", end),
        normalized.lastIndexOf(". ", end),
        normalized.lastIndexOf("\n", end),
      );
      if (boundary > start + 400) end = boundary + 1;
    }
    const text = normalized.slice(start, end).trim();
    if (text) chunks.push(text);
    if (chunks.length > KNOWLEDGE_LIMITS.maxChunks) {
      throw new Error("Knowledge document produces too many chunks.");
    }
    if (end >= normalized.length) break;
    start = Math.max(start + 1, end - KNOWLEDGE_LIMITS.overlapChars);
  }
  return chunks.map((text, index) => {
    const contentHash = createHash("sha256").update(text).digest("hex");
    return {
      index,
      externalId: `chunk-${index}-${contentHash.slice(0, 12)}`,
      text,
      category,
      contentHash,
    };
  });
}

export function configuredKnowledgeEmbedder():
  | {
      embed: Embedder;
      model: string;
    }
  | {
      embed: null;
      model: null;
    } {
  if (!process.env.OLLAMA_HOST) return { embed: null, model: null };
  const model = process.env.OLLAMA_EMBED_MODEL?.trim() || "nomic-embed-text";
  return { embed: createOllamaEmbedder({ model }), model };
}

export type RagIndexingJob =
  Database["public"]["Tables"]["rag_indexing_jobs"]["Row"];

export async function runKnowledgeIndexingJob(
  client: ServerSupabaseClient,
  job: RagIndexingJob,
): Promise<"completed" | "superseded"> {
  const { data: document, error } = await client
    .from("rag_documents")
    .select("id, tenant_id, content, category, revision, status")
    .eq("id", job.document_id)
    .eq("tenant_id", job.tenant_id)
    .maybeSingle();
  if (error)
    throw new Error(`Unable to load knowledge document: ${error.message}`);
  if (
    !document ||
    document.revision !== job.revision ||
    document.status === "archived"
  ) {
    await client.rpc("complete_rag_indexing_job", {
      p_job_id: job.id,
      p_chunks: [],
      p_embedding_model: null,
    });
    return "superseded";
  }
  const chunks = chunkKnowledgeDocument(document.content, document.category);
  if (chunks.length === 0)
    throw new Error("Knowledge document has no indexable content.");
  const embedding = configuredKnowledgeEmbedder();
  if (embedding.embed) {
    const hashes = chunks.map((chunk) => chunk.contentHash);
    const { data: reusable, error: reusableError } = await client
      .from("rag_chunks")
      .select("content_hash, embedding")
      .eq("tenant_id", job.tenant_id)
      .eq("document_id", job.document_id)
      .eq("embedding_model", embedding.model)
      .in("content_hash", hashes)
      .not("embedding", "is", null);
    if (reusableError) {
      throw new Error(
        `Unable to load reusable embeddings: ${reusableError.message}`,
      );
    }
    const cached = new Map<string, number[]>();
    for (const row of reusable ?? []) {
      const vector = normalizeStoredEmbedding(row.embedding);
      if (
        row.content_hash &&
        vector?.length === 768 &&
        vector.every(Number.isFinite)
      ) {
        cached.set(row.content_hash, vector);
      }
    }
    for (const chunk of chunks) {
      const existing = cached.get(chunk.contentHash);
      const vector = existing ?? (await embedding.embed(chunk.text));
      if (vector.length !== 768 || !vector.every(Number.isFinite)) {
        throw new Error(
          `Embedding dimension ${vector.length} does not match a finite 768-vector.`,
        );
      }
      chunk.embedding = vector;
    }
  }
  const { data: completed, error: completionError } = await client.rpc(
    "complete_rag_indexing_job",
    { p_job_id: job.id, p_chunks: chunks, p_embedding_model: embedding.model },
  );
  if (completionError)
    throw new Error(
      `Unable to publish knowledge index: ${completionError.message}`,
    );
  return completed ? "completed" : "superseded";
}

function normalizeStoredEmbedding(value: unknown): number[] | null {
  if (Array.isArray(value)) {
    return value.every((item) => typeof item === "number") ? value : null;
  }
  if (
    typeof value !== "string" ||
    !value.startsWith("[") ||
    !value.endsWith("]")
  ) {
    return null;
  }
  const parsed = value.slice(1, -1).split(",").map(Number);
  return parsed.every(Number.isFinite) ? parsed : null;
}
