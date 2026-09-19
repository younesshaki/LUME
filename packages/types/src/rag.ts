import type { TenantId } from "./tenant";

export type RagDocument = {
  id: string;
  tenantId: TenantId;
  title: string;
  category: string;
  source: string | null;
  content: string;
  status: "draft" | "published" | "archived";
  visibility: "public";
  revision: number;
  publishedRevision: number | null;
  embeddingStatus:
    "not_indexed" | "pending" | "indexed" | "lexical_only" | "failed";
  embeddingModel: string | null;
  publishedAt: string | null;
  indexedAt: string | null;
  indexingError: string | null;
  createdAt: string;
};

export type RagChunk = {
  id: string;
  tenantId: TenantId;
  documentId: string;
  text: string;
  category: string;
  /** Vector embedding — only present on server-side reads. */
  embedding?: number[];
};

export type RetrievedChunk = {
  /** Internal evidence handle. Never expose the raw database id as a URL. */
  chunkId?: string;
  text: string;
  category: string;
  score: number;
  documentId?: string;
  documentTitle?: string;
  documentRevision?: number;
  publishedAt?: string | null;
  retrievalSource?: "lexical" | "semantic" | "hybrid";
};
