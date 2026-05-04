import embeddedChunks from "./knowledge/embeddings.json";

type EmbeddedChunk = {
  id: string;
  text: string;
  category: string;
  embedding: number[];
};

const CHUNKS = embeddedChunks as EmbeddedChunk[];

const OLLAMA_EMBED_URL =
  (import.meta.env.VITE_OLLAMA_CHAT_URL as string | undefined)?.replace(
    "/api/chat",
    "/api/embeddings"
  ) ?? "/ollama/api/embeddings";

const EMBED_MODEL =
  (import.meta.env.VITE_OLLAMA_EMBED_MODEL as string | undefined) ?? "nomic-embed-text";

const BASE_SYSTEM_PROMPT = `You are the LUME assistant. LUME is an invitation-only secret luxury hotel in Monaco with approximately 70 rooms. Access is granted based on positive societal impact, not wealth — one stay per year per invited guest.

You answer questions about LUME's concept, products, experience, and access. Be concise, restrained, and confident in tone — matching LUME's premium brand voice. Never invent facts. If something is outside your knowledge, say so elegantly.`;

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function embedQuery(query: string, signal?: AbortSignal): Promise<number[]> {
  const response = await fetch(OLLAMA_EMBED_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: query }),
    signal,
  });
  if (!response.ok) {
    throw new Error(`Embedding failed: ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as { embedding: number[] };
  return data.embedding;
}

async function retrieveContext(
  query: string,
  topK = 4,
  signal?: AbortSignal
): Promise<string[]> {
  const queryEmbedding = await embedQuery(query, signal);
  const scored = CHUNKS.map((chunk) => ({
    text: chunk.text,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map((s) => s.text);
}

export async function getSystemPromptWithContext(
  query: string,
  signal?: AbortSignal
): Promise<string> {
  const contextChunks = await retrieveContext(query, 4, signal);
  if (contextChunks.length === 0) return BASE_SYSTEM_PROMPT;
  const contextBlock = contextChunks.map((c, i) => `[${i + 1}] ${c}`).join("\n\n");
  return `${BASE_SYSTEM_PROMPT}\n\n---\nRelevant context:\n${contextBlock}\n---`;
}
