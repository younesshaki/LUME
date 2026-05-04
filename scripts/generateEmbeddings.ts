import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chunks } from "../src/lib/knowledge/chunks.js";

const OLLAMA_HOST = process.env.VITE_OLLAMA_HOST ?? "http://192.168.11.118:11434";
const EMBED_MODEL = process.env.VITE_OLLAMA_EMBED_MODEL ?? "nomic-embed-text";
const EMBED_URL = `${OLLAMA_HOST}/api/embeddings`;

type EmbeddedChunk = {
  id: string;
  text: string;
  category: string;
  embedding: number[];
};

async function embedText(text: string): Promise<number[]> {
  const response = await fetch(EMBED_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
  });
  if (!response.ok) {
    throw new Error(`Embed failed: ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as { embedding: number[] };
  return data.embedding;
}

async function main() {
  console.log(`Ollama host: ${OLLAMA_HOST}`);
  console.log(`Embed model: ${EMBED_MODEL}`);
  console.log(`Embedding ${chunks.length} chunks...\n`);

  const results: EmbeddedChunk[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    process.stdout.write(`[${i + 1}/${chunks.length}] "${chunk.id}"...`);
    const embedding = await embedText(chunk.text);
    results.push({ id: chunk.id, text: chunk.text, category: chunk.category, embedding });
    process.stdout.write(` done (${embedding.length}d)\n`);
    await new Promise((r) => setTimeout(r, 80));
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const outPath = resolve(__dirname, "../src/lib/knowledge/embeddings.json");
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nWrote ${results.length} chunks to ${outPath}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
