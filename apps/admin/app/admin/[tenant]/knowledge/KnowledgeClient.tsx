"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { KnowledgeDocument } from "@/lib/knowledge";

type Props = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  initialDocuments: KnowledgeDocument[];
};
type Draft = {
  id: string | null;
  title: string;
  category: string;
  source: string;
  content: string;
};
const EMPTY_DRAFT: Draft = {
  id: null,
  title: "",
  category: "general",
  source: "",
  content: "",
};

export default function KnowledgeClient({
  tenantId,
  tenantSlug,
  tenantName,
  initialDocuments,
}: Props) {
  const router = useRouter();
  const [documents, setDocuments] = useState(initialDocuments);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  useEffect(() => setDocuments(initialDocuments), [initialDocuments]);

  async function saveDraft() {
    if (!draft) return;
    setBusyId(draft.id ?? "new");
    try {
      const { error } = await createSupabaseBrowserClient().rpc(
        "save_rag_document",
        {
          p_tenant_id: tenantId,
          p_document_id: draft.id,
          p_title: draft.title,
          p_category: draft.category,
          p_source: draft.source || null,
          p_content: draft.content,
        },
      );
      if (error) throw new Error(error.message);
      toast.success(draft.id ? "Draft saved" : "Knowledge document created");
      setDraft(null);
      router.refresh();
    } catch (error) {
      toast.error("Unable to save knowledge document", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusyId(null);
    }
  }

  async function publish(document: KnowledgeDocument) {
    setBusyId(document.id);
    try {
      const { error } = await createSupabaseBrowserClient().rpc(
        "enqueue_rag_indexing_job",
        { p_tenant_id: tenantId, p_document_id: document.id },
      );
      if (error) throw new Error(error.message);
      toast.success("Publication queued", {
        description: "The current revision becomes live after indexing.",
      });
      router.refresh();
    } catch (error) {
      toast.error("Unable to queue publication", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusyId(null);
    }
  }

  async function archive(document: KnowledgeDocument) {
    setBusyId(document.id);
    try {
      const { error } = await createSupabaseBrowserClient().rpc(
        "archive_rag_document",
        { p_tenant_id: tenantId, p_document_id: document.id },
      );
      if (error) throw new Error(error.message);
      setDocuments((items) =>
        items.map((item) =>
          item.id === document.id ? { ...item, status: "archived" } : item,
        ),
      );
      toast.success("Document archived", {
        description: "It is no longer eligible for concierge retrieval.",
      });
      router.refresh();
    } catch (error) {
      toast.error("Unable to archive document", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Knowledge</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Published, tenant-scoped concierge knowledge for {tenantName}{" "}
            <code>/{tenantSlug}</code>.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDraft(EMPTY_DRAFT)}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          New document
        </button>
      </header>
      {draft && (
        <section
          className="space-y-4 rounded-xl border bg-card p-5"
          aria-label="Knowledge document editor"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Title"
              value={draft.title}
              maxLength={160}
              onChange={(title) => setDraft({ ...draft, title })}
            />
            <Field
              label="Category"
              value={draft.category}
              maxLength={80}
              onChange={(category) => setDraft({ ...draft, category })}
            />
          </div>
          <Field
            label="Source (optional)"
            value={draft.source}
            maxLength={500}
            onChange={(source) => setDraft({ ...draft, source })}
          />
          <label className="block text-sm font-medium">
            Content
            <textarea
              value={draft.content}
              onChange={(event) =>
                setDraft({ ...draft, content: event.target.value })
              }
              rows={14}
              maxLength={200000}
              className="mt-1 w-full rounded-md border bg-background p-3 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-md border px-3 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={
                !draft.title.trim() ||
                !draft.category.trim() ||
                !draft.content.trim() ||
                busyId !== null
              }
              onClick={() => void saveDraft()}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busyId ? "Saving…" : "Save draft"}
            </button>
          </div>
        </section>
      )}
      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <Th>Document</Th>
              <Th>Status</Th>
              <Th>Index</Th>
              <Th>Chunks</Th>
              <Th>Updated</Th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {documents.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-muted-foreground"
                >
                  No knowledge documents yet.
                </td>
              </tr>
            )}
            {documents.map((document) => (
              <tr key={document.id} className="border-b last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium">{document.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {document.category} · revision {document.revision}
                    {document.publishedRevision
                      ? ` / live ${document.publishedRevision}`
                      : ""}
                  </p>
                </td>
                <td className="px-4 py-3 capitalize">{document.status}</td>
                <td className="px-4 py-3">
                  <span className="capitalize">
                    {document.embeddingStatus.replaceAll("_", " ")}
                  </span>
                  {document.indexingError && (
                    <p className="max-w-xs text-xs text-red-600">
                      {document.indexingError}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">
                  {document.chunkCount.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDate(document.updatedAt)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setDraft({
                          id: document.id,
                          title: document.title,
                          category: document.category,
                          source: document.source ?? "",
                          content: document.content,
                        })
                      }
                      className="rounded border px-2 py-1 text-xs"
                    >
                      Edit
                    </button>
                    {document.status !== "archived" && (
                      <button
                        type="button"
                        disabled={
                          busyId === document.id ||
                          document.embeddingStatus === "pending"
                        }
                        onClick={() => void publish(document)}
                        className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                      >
                        Publish
                      </button>
                    )}
                    {document.status !== "archived" && (
                      <ConfirmActionDialog
                        title={`Archive "${document.title}"?`}
                        description="The concierge stops retrieving it immediately. Editors keep the content."
                        actionLabel="Archive"
                        onConfirm={() => void archive(document)}
                      >
                        <button
                          type="button"
                          className="rounded border border-red-200 px-2 py-1 text-xs text-red-700"
                        >
                          Archive
                        </button>
                      </ConfirmActionDialog>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  maxLength,
  onChange,
}: {
  label: string;
  value: string;
  maxLength: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        className="mt-1 w-full rounded-md border bg-background px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}
function Th({ children }: { children: ReactNode }) {
  return (
    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
      {children}
    </th>
  );
}
function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}
