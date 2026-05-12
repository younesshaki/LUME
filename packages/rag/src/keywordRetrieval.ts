/**
 * Keyword + fuzzy retrieval — the original LUME approach. No embeddings needed
 * at runtime. Suitable for knowledge bases up to a few thousand chunks; beyond
 * that, switch to pgvector via `retrieveContext` in ./server.
 *
 * Two-pass scoring:
 *   1. Exact substring match per query word (length > 2) → +1.0
 *   2. Fuzzy (Levenshtein) match against any word in the chunk → +0.7
 * Top-k by score, descending. Ties broken by original order.
 */
import type { RetrievedChunk } from "@lume/types";
import { isFuzzyMatch } from "./fuzzyMatch";

export type KeywordChunk = {
  text: string;
  category: string;
};

function fuzzyWordInText(word: string, text: string): boolean {
  const textWords = text.split(/\s+/);
  return textWords.some((tw) => tw.length > 2 && isFuzzyMatch(word, tw));
}

export function scoreChunkByKeywords(chunk: KeywordChunk, query: string): number {
  const q = query.toLowerCase();
  const text = chunk.text.toLowerCase();
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return 0;

  let score = 0;
  for (const word of words) {
    if (text.includes(word)) {
      score += 1;
      continue;
    }
    if (fuzzyWordInText(word, text)) {
      score += 0.7;
    }
  }
  return score;
}

export function retrieveByKeywords(
  chunks: KeywordChunk[],
  query: string,
  topK = 7
): RetrievedChunk[] {
  const scored = chunks.map((chunk) => ({
    text: chunk.text,
    category: chunk.category,
    score: scoreChunkByKeywords(chunk, query),
  }));
  scored.sort((a, b) => b.score - a.score);
  // Drop zero-score chunks — no point feeding pure noise into the prompt.
  return scored.filter((s) => s.score > 0).slice(0, topK);
}
