import { describe, expect, it } from "vitest";
import { retrieveHybridContext } from "./server";

describe("hybrid RAG retrieval", () => {
  it("falls back to lexical RPC input when the embedder is unavailable", async () => {
    const calls: unknown[] = [];
    const client = {
      rpc: async (_name: string, args: unknown) => {
        calls.push(args);
        return {
          data: [
            {
              document_id: "doc",
              text: "Hours are nine to five.",
              category: "hours",
              score: 0.2,
              source: "lexical",
            },
          ],
          error: null,
        };
      },
    };
    const result = await retrieveHybridContext({
      client: client as never,
      tenantId: "00000000-0000-4000-8000-000000000001" as never,
      query: "opening hours",
      embed: async () => {
        throw new Error("offline");
      },
    });
    expect(calls[0]).toMatchObject({
      p_query_embedding: null,
      p_query_text: "opening hours",
    });
    expect(result[0]).toMatchObject({
      documentId: "doc",
      retrievalSource: "lexical",
    });
  });

  it("passes a query vector without changing tenant scope", async () => {
    let args: Record<string, unknown> = {};
    const vector = Array.from({ length: 768 }, () => 0.1);
    const client = {
      rpc: async (_name: string, input: Record<string, unknown>) => {
        args = input;
        return { data: [], error: null };
      },
    };
    await retrieveHybridContext({
      client: client as never,
      tenantId: "tenant" as never,
      query: "returns",
      embed: async () => vector,
      topK: 4,
    });
    expect(args).toEqual({
      p_tenant_id: "tenant",
      p_query_text: "returns",
      p_query_embedding: vector,
      p_match_count: 4,
    });
  });

  it("drops malformed vectors and keeps lexical retrieval available", async () => {
    let args: Record<string, unknown> = {};
    const client = {
      rpc: async (_name: string, input: Record<string, unknown>) => {
        args = input;
        return { data: [], error: null };
      },
    };
    await retrieveHybridContext({
      client: client as never,
      tenantId: "tenant" as never,
      query: "service hours",
      embed: async () => [Number.NaN],
    });
    expect(args.p_query_embedding).toBeNull();
  });
});
