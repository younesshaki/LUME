#!/usr/bin/env npx tsx
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServiceClient } from "@lume/db/server";
import { retrieveByKeywords } from "@lume/rag";
import { createOllamaEmbedder, retrieveHybridContext } from "@lume/rag/server";

type GoldCase = { id: string; query: string; expectedContains: string };

if (process.env.RAG_RETRIEVAL_EVAL !== "1") {
  fail("Refusing database access. Set RAG_RETRIEVAL_EVAL=1 explicitly.");
}
const tenantId = process.env.RAG_EVAL_TENANT_ID?.trim();
if (!tenantId) fail("Set RAG_EVAL_TENANT_ID to an approved test tenant UUID.");
const fixturePath = resolve(
  process.cwd(),
  process.env.RAG_EVAL_FIXTURE ?? "scripts/fixtures/rag-retrieval-gold.json",
);
const gold = JSON.parse(readFileSync(fixturePath, "utf8")) as GoldCase[];
if (!Array.isArray(gold) || gold.length === 0)
  fail("The retrieval fixture is empty.");

const client = createServiceClient();
const { data: documents, error: documentsError } = await client
  .from("rag_documents")
  .select("id, published_revision")
  .eq("tenant_id", tenantId)
  .eq("status", "published")
  .eq("visibility", "public");
if (documentsError)
  fail(`Unable to load published documents: ${documentsError.message}`);
const published = new Map(
  (documents ?? []).flatMap((document) =>
    document.published_revision === null
      ? []
      : [[document.id, document.published_revision] as const],
  ),
);
const documentIds = [...published.keys()];
if (documentIds.length === 0)
  fail("The approved tenant has no published knowledge.");
const { data: chunks, error: chunksError } = await client
  .from("rag_chunks")
  .select("document_id, revision, text, category")
  .eq("tenant_id", tenantId)
  .in("document_id", documentIds);
if (chunksError)
  fail(`Unable to load benchmark corpus: ${chunksError.message}`);
const corpus = (chunks ?? []).filter(
  (chunk) => published.get(chunk.document_id) === chunk.revision,
);
const embed = process.env.OLLAMA_HOST ? createOllamaEmbedder() : null;
const rows = [];

for (const entry of gold) {
  const keyword = retrieveByKeywords(corpus, entry.query, 7);
  const lexical = await retrieveHybridContext({
    client,
    tenantId: tenantId as never,
    query: entry.query,
    embed: null,
    topK: 7,
  });
  const hybrid = embed
    ? await retrieveHybridContext({
        client,
        tenantId: tenantId as never,
        query: entry.query,
        embed,
        topK: 7,
      })
    : null;
  rows.push({
    id: entry.id,
    keyword: containsExpected(keyword, entry.expectedContains),
    lexical: containsExpected(lexical, entry.expectedContains),
    hybrid: hybrid ? containsExpected(hybrid, entry.expectedContains) : null,
  });
}

console.info(
  JSON.stringify(
    {
      fixture: fixturePath,
      cases: rows.length,
      embeddingMode: embed ? "ollama" : "disabled",
      recallAt7: {
        keyword: recall(rows.map((row) => row.keyword)),
        lexical: recall(rows.map((row) => row.lexical)),
        hybrid: embed ? recall(rows.map((row) => row.hybrid === true)) : null,
      },
      rows,
    },
    null,
    2,
  ),
);

function containsExpected(
  results: readonly { text: string }[],
  expected: string,
): boolean {
  const needle = expected.toLocaleLowerCase();
  return results.some((result) =>
    result.text.toLocaleLowerCase().includes(needle),
  );
}

function recall(values: readonly boolean[]): number {
  return values.filter(Boolean).length / values.length;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
