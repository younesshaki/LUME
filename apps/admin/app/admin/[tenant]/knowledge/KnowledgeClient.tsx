"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { KnowledgeDocument } from "@/lib/knowledge";

type KnowledgeClientProps = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  initialDocuments: KnowledgeDocument[];
};

type StatusState =
  | { type: "idle"; message: string }
  | { type: "loading"; message: string }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

export default function KnowledgeClient({
  tenantId,
  tenantSlug,
  tenantName,
  initialDocuments,
}: KnowledgeClientProps) {
  const router = useRouter();
  const [documents, setDocuments] = useState(initialDocuments);
  const [status, setStatus] = useState<StatusState>({ type: "idle", message: "" });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function deleteDocument(document: KnowledgeDocument) {
    const confirmed = window.confirm(
      `Delete "${document.title}" and its ${document.chunkCount} chunk${
        document.chunkCount === 1 ? "" : "s"
      }?`
    );
    if (!confirmed) return;

    setDeletingId(document.id);
    setStatus({ type: "loading", message: "Deleting knowledge document..." });
    try {
      const { error } = await createSupabaseBrowserClient()
        .from("rag_documents")
        .delete()
        .eq("id", document.id)
        .eq("tenant_id", tenantId);
      if (error) throw new Error(error.message);
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      setStatus({ type: "success", message: "Knowledge document deleted." });
      router.refresh();
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to delete document.",
      });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Knowledge</h1>
        <p className="mt-1 text-sm text-neutral-500">
          RAG source documents and indexed chunks for {tenantName}{" "}
          <code>/{tenantSlug}</code>.
        </p>
      </header>

      {status.message && <StatusBanner type={status.type} message={status.message} />}

      <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
              <th className="px-4 py-3 text-left font-medium text-neutral-500">Document</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-500">Category</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-500">Chunks</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-500">Updated</th>
              <th className="px-4 py-3 text-right font-medium text-neutral-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {documents.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-neutral-500">
                  No knowledge documents indexed yet.
                </td>
              </tr>
            )}
            {documents.map((document) => (
              <tr
                key={document.id}
                className="border-b border-neutral-100 last:border-0 dark:border-neutral-800"
              >
                <td className="px-4 py-3">
                  <p className="font-medium">{document.title}</p>
                  {document.source && (
                    <p className="mt-1 max-w-md truncate text-xs text-neutral-500">
                      {document.source}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-500">{document.category}</td>
                <td className="px-4 py-3 text-neutral-500">
                  {document.chunkCount.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-neutral-500">
                  {formatDate(document.updatedAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => void deleteDocument(document)}
                    disabled={deletingId === document.id}
                    className="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/30"
                  >
                    {deletingId === document.id ? "Deleting..." : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBanner({ type, message }: { type: StatusState["type"]; message: string }) {
  const className =
    type === "error"
      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
      : type === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
        : "border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300";

  return (
    <div
      className={`rounded-lg border px-3 py-2 text-sm ${className}`}
      role={type === "error" ? "alert" : "status"}
    >
      {message}
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
