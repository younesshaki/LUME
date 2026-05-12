import type { TenantId } from "./tenant";

export type RagDocument = {
  id: string;
  tenantId: TenantId;
  title: string;
  category: string;
  source: string | null;
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
  text: string;
  category: string;
  score: number;
};
