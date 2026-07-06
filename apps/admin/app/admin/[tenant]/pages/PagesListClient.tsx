"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  archivePage,
  deletePage,
  duplicatePage,
  updatePageNavOrder,
  validateNewPageSlug,
} from "@lume/db";
import type { Page } from "@lume/types";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type PagesListClientProps = {
  tenantId: string;
  tenantSlug: string;
  initialPages: Page[];
};

type StatusState =
  | { type: "idle"; message: string }
  | { type: "saving"; message: string }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

export default function PagesListClient({
  tenantId,
  tenantSlug,
  initialPages,
}: PagesListClientProps) {
  const router = useRouter();
  const [pages, setPages] = useState(initialPages);
  const [draggingPageId, setDraggingPageId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusState>({ type: "idle", message: "" });

  async function reorderPages(activePageId: string, overPageId: string) {
    if (activePageId === overPageId) return;
    const previous = pages;
    const next = movePage(previous, activePageId, overPageId).map((page, navOrder) => ({
      ...page,
      navOrder,
    }));
    setPages(next);
    setStatus({ type: "saving", message: "Saving page order..." });
    try {
      const supabase = createPageServiceClient();
      await updatePageNavOrder(supabase, tenantId, next.map((page) => page.id));
      setStatus({ type: "success", message: "Page order saved." });
      router.refresh();
    } catch (error) {
      setPages(previous);
      setStatus({ type: "error", message: errorMessage(error, "Unable to save page order.") });
    }
  }

  async function handleDuplicate(page: Page) {
    const suggestion = nextCopySlug(page.slug, pages.map((item) => item.slug));
    const input = window.prompt("Duplicate page slug", suggestion);
    if (input === null) return;

    const validation = validateNewPageSlug(input, pages.map((item) => item.slug));
    if (!validation.ok) {
      setStatus({ type: "error", message: validation.reason });
      return;
    }

    setStatus({ type: "saving", message: "Duplicating page..." });
    try {
      const supabase = createPageServiceClient();
      const duplicated = await duplicatePage(supabase, page.id, {
        slug: validation.slug,
        title: `${page.title || page.slug} Copy`,
        navOrder: pages.length,
      });
      setPages((current) => [...current, duplicated]);
      setStatus({ type: "success", message: "Page duplicated." });
      router.push(`/admin/${tenantSlug}/pages/${duplicated.id}`);
    } catch (error) {
      setStatus({ type: "error", message: errorMessage(error, "Unable to duplicate page.") });
    }
  }

  async function handleArchive(page: Page) {
    if (page.isReserved) return;
    setStatus({ type: "saving", message: "Archiving page..." });
    try {
      const supabase = createPageServiceClient();
      await archivePage(supabase, page.id);
      const archivedAt = new Date().toISOString();
      setPages((current) =>
        current.map((item) => (item.id === page.id ? { ...item, archivedAt } : item))
      );
      setStatus({ type: "idle", message: "" });
      toast.success(`Archived /${page.slug}`);
      router.refresh();
    } catch (error) {
      setStatus({ type: "idle", message: "" });
      toast.error("Unable to archive page", {
        description: errorMessage(error, "Unable to archive page."),
      });
    }
  }

  async function handleDelete(page: Page) {
    if (page.isReserved) return;
    setStatus({ type: "saving", message: "Deleting page..." });
    try {
      const supabase = createPageServiceClient();
      await deletePage(supabase, page.id);
      setPages((current) => current.filter((item) => item.id !== page.id));
      setStatus({ type: "idle", message: "" });
      toast.success(`Deleted /${page.slug}`);
      router.refresh();
    } catch (error) {
      setStatus({ type: "idle", message: "" });
      toast.error("Unable to delete page", {
        description: errorMessage(error, "Unable to delete page."),
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Drag rows to reorder public navigation. Reserved pages cannot be deleted.
          </p>
        </div>
        <Link
          href={`/admin/${tenantSlug}/pages/new`}
          className="rounded-md bg-neutral-950 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
        >
          New Page
        </Link>
      </div>

      {status.message && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            status.type === "error"
              ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
              : status.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                : "border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
          }`}
          role={status.type === "error" ? "alert" : "status"}
        >
          {status.message}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Order</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Page</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Slug</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pages.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  No pages found for this tenant.
                </td>
              </tr>
            )}
            {pages.map((page, index) => (
              <tr
                key={page.id}
                draggable
                onDragStart={() => setDraggingPageId(page.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (draggingPageId) void reorderPages(draggingPageId, page.id);
                  setDraggingPageId(null);
                }}
                className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900/50"
              >
                <td className="px-4 py-3 text-muted-foreground">
                  <span className="cursor-grab rounded border border-neutral-200 px-2 py-1 text-xs dark:border-neutral-800">
                    {index + 1}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{page.title || page.slug}</span>
                    {page.isReserved && (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                        Reserved
                      </span>
                    )}
                    {page.archivedAt && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                        Archived
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <code className="text-xs text-muted-foreground">/{page.slug}</code>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{pageStatus(page)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <Link
                      href={`/admin/${tenantSlug}/pages/${page.id}`}
                      className="text-xs font-medium text-neutral-600 hover:text-neutral-950 dark:text-muted-foreground dark:hover:text-white"
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      onClick={() => void handleDuplicate(page)}
                      className="text-xs font-medium text-neutral-600 hover:text-neutral-950 dark:text-muted-foreground dark:hover:text-white"
                    >
                      Duplicate
                    </button>
                    <ConfirmActionDialog
                      title={`Archive /${page.slug}?`}
                      description="The page disappears from public navigation and stops rendering on the site. Its content and revisions are kept, so it can be restored later."
                      actionLabel="Archive page"
                      destructive={false}
                      onConfirm={() => void handleArchive(page)}
                    >
                      <button
                        type="button"
                        disabled={page.isReserved || Boolean(page.archivedAt)}
                        className="text-xs font-medium text-neutral-600 hover:text-neutral-950 disabled:cursor-not-allowed disabled:opacity-40 dark:text-muted-foreground dark:hover:text-white"
                      >
                        Archive
                      </button>
                    </ConfirmActionDialog>
                    <ConfirmActionDialog
                      title={`Delete /${page.slug}?`}
                      description="This permanently removes the page and every one of its revisions. This action cannot be undone."
                      actionLabel="Delete page"
                      onConfirm={() => void handleDelete(page)}
                    >
                      <button
                        type="button"
                        disabled={page.isReserved}
                        className="text-xs font-medium text-destructive hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </ConfirmActionDialog>
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

function pageStatus(page: Page): string {
  if (page.archivedAt) return "Archived";
  if (page.draftRevisionId && page.publishedRevisionId) return "Published with draft";
  if (page.draftRevisionId) return "Draft only";
  if (page.publishedRevisionId) return "Published";
  return "Empty";
}

function movePage(pages: Page[], activePageId: string, overPageId: string): Page[] {
  const fromIndex = pages.findIndex((page) => page.id === activePageId);
  const toIndex = pages.findIndex((page) => page.id === overPageId);
  if (fromIndex < 0 || toIndex < 0) return pages;
  const next = [...pages];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function nextCopySlug(slug: string, existingSlugs: string[]): string {
  let index = 1;
  let candidate = `${slug}-copy`;
  while (existingSlugs.includes(candidate)) {
    index += 1;
    candidate = `${slug}-copy-${index}`;
  }
  return candidate;
}

function createPageServiceClient(): Parameters<typeof updatePageNavOrder>[0] {
  return createSupabaseBrowserClient() as unknown as Parameters<typeof updatePageNavOrder>[0];
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
