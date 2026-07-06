"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { KnowledgeDocument } from "@/lib/knowledge";

type KnowledgeClientProps = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  initialDocuments: KnowledgeDocument[];
};

export default function KnowledgeClient({
  tenantId,
  tenantSlug,
  tenantName,
  initialDocuments,
}: KnowledgeClientProps) {
  const router = useRouter();
  const [documents, setDocuments] = useState(initialDocuments);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function deleteDocument(document: KnowledgeDocument) {
    setDeletingId(document.id);
    try {
      const { error } = await createSupabaseBrowserClient()
        .from("rag_documents")
        .delete()
        .eq("id", document.id)
        .eq("tenant_id", tenantId);
      if (error) throw new Error(error.message);
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      toast.success(`Deleted "${document.title}"`);
      router.refresh();
    } catch (error) {
      toast.error("Unable to delete document", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Knowledge</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          RAG source documents and indexed chunks for {tenantName}{" "}
          <code>/{tenantSlug}</code>.
        </p>
      </header>

      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Document</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Category</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Chunks</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Updated</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {documents.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  No knowledge documents indexed yet.
                </td>
              </tr>
            )}
            {documents.map((document) => (
              <tr
                key={document.id}
                className="border-b last:border-0"
              >
                <td className="px-4 py-3">
                  <p className="font-medium">{document.title}</p>
                  {document.source && (
                    <p className="mt-1 max-w-md truncate text-xs text-muted-foreground">
                      {document.source}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{document.category}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {document.chunkCount.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDate(document.updatedAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  <ConfirmActionDialog
                    title={`Delete "${document.title}"?`}
                    description={`This permanently removes the document and its ${document.chunkCount.toLocaleString()} chunk${document.chunkCount === 1 ? "" : "s"} from the bot's knowledge. This action cannot be undone.`}
                    actionLabel="Delete document"
                    onConfirm={() => void deleteDocument(document)}
                  >
                    <button
                      type="button"
                      disabled={deletingId === document.id}
                      className="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/30"
                    >
                      {deletingId === document.id ? "Deleting..." : "Delete"}
                    </button>
                  </ConfirmActionDialog>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
