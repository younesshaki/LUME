"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@lume/db";
import { useRouter } from "next/navigation";
import { publishDraft, restoreRevision, unpublishPage, updateDraftBlocks } from "@lume/db";
import type { PageBlock, PageBlocksDocument, PageRevision } from "@lume/types";
import type { BlockCategory, BlockField, EditorBlockDescriptor } from "@lume/blocks";
import { reorderByBlockId, validatePageBlocksDocument } from "@lume/blocks";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { listTenantMediaAssets, type TenantAsset } from "@/lib/assets";
import { LivePreviewPanel } from "./LivePreviewPanel";

type EditorPage = {
  id: string;
  slug: string;
  title: string;
  draftRevisionId: string | null;
  publishedRevisionId: string | null;
};

type SaveState =
  | { type: "idle"; message: string }
  | { type: "saving"; message: string }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

type PublicationStatus = {
  tone: "neutral" | "success" | "warning";
  label: string;
  detail: string;
};

type PageEditorClientProps = {
  tenantId: string;
  tenantSlug: string;
  publicSiteBaseUrl: string;
  page: EditorPage;
  initialBlocks: PageBlocksDocument;
  initialRevisions: PageRevision[];
  blockDescriptors: EditorBlockDescriptor[];
};

export default function PageEditorClient({
  tenantId,
  tenantSlug,
  publicSiteBaseUrl,
  page,
  initialBlocks,
  initialRevisions,
  blockDescriptors,
}: PageEditorClientProps) {
  const router = useRouter();
  const [blocks, setBlocks] = useState<PageBlock[]>(initialBlocks.blocks);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(
    initialBlocks.blocks[0]?.id ?? null
  );
  const [state, setState] = useState<SaveState>({ type: "idle", message: "" });
  const [blockErrors, setBlockErrors] = useState<Record<string, string[]>>({});
  const [previewRevisionId, setPreviewRevisionId] = useState<string | null>(
    initialRevisions[0]?.id ?? null
  );
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [dragTargetId, setDragTargetId] = useState<string | null>(null);

  const descriptorsByType = useMemo(
    () => new Map(blockDescriptors.map((descriptor) => [descriptor.type, descriptor])),
    [blockDescriptors]
  );
  const paletteDescriptors = useMemo(
    () => blockDescriptors.filter((descriptor) => descriptor.palette),
    [blockDescriptors]
  );
  const paletteByCategory = useMemo(() => {
    const groups = new Map<BlockCategory, EditorBlockDescriptor[]>();
    for (const descriptor of paletteDescriptors) {
      groups.set(descriptor.category, [...(groups.get(descriptor.category) ?? []), descriptor]);
    }
    return groups;
  }, [paletteDescriptors]);
  const selectedBlock = blocks.find((block) => block.id === selectedBlockId) ?? null;
  const selectedDescriptor = selectedBlock ? descriptorsByType.get(selectedBlock.type) : null;
  const currentDraftDocument = currentDocument(blocks, initialBlocks.version);
  const publishedRevision =
    initialRevisions.find((revision) => revision.id === page.publishedRevisionId) ?? null;
  const publicationStatus = describePublicationStatus(currentDraftDocument, publishedRevision);
  const previewRevision =
    initialRevisions.find((revision) => revision.id === previewRevisionId) ??
    initialRevisions[0] ??
    null;

  function addBlock(descriptor: EditorBlockDescriptor) {
    const block: PageBlock = {
      id: createBlockId(descriptor.type),
      type: descriptor.type,
      props: cloneProps(descriptor.defaultProps),
    };
    setBlocks((current) => [...current, block]);
    setSelectedBlockId(block.id);
    setState({ type: "idle", message: "" });
  }

  function moveBlock(blockId: string, direction: -1 | 1) {
    setBlocks((current) => {
      const index = current.findIndex((block) => block.id === blockId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function dropBlock(targetId: string) {
    if (!draggedBlockId) return;
    setBlocks((current) => reorderByBlockId(current, draggedBlockId, targetId));
    setSelectedBlockId(draggedBlockId);
    setDraggedBlockId(null);
    setDragTargetId(null);
    setState({ type: "idle", message: "" });
  }

  function removeBlock(blockId: string) {
    const nextBlocks = blocks.filter((block) => block.id !== blockId);
    setBlocks(nextBlocks);
    if (selectedBlockId === blockId) setSelectedBlockId(nextBlocks[0]?.id ?? null);
    setBlockErrors((current) => {
      const next = { ...current };
      delete next[blockId];
      return next;
    });
  }

  function updateSelectedProp(field: BlockField, value: unknown) {
    if (!selectedBlock) return;
    setBlocks((current) =>
      current.map((block) => {
        if (block.id !== selectedBlock.id) return block;
        return {
          ...block,
          props: {
            ...(selectedDescriptor ? cloneProps(selectedDescriptor.defaultProps) : {}),
            ...block.props,
            [field.name]: value,
          },
        };
      })
    );
    setBlockErrors((current) => {
      const next = { ...current };
      delete next[selectedBlock.id];
      return next;
    });
    setState({ type: "idle", message: "" });
  }

  async function saveDraft() {
    const doc = currentDocument(blocks, initialBlocks.version);
    if (!validateDocumentOrShow(doc)) return false;

    setState({ type: "saving", message: "Saving draft..." });
    try {
      const supabase = createPageServiceClient();
      await updateDraftBlocks(supabase, page.id, doc);
      setState({ type: "success", message: "Draft saved." });
      router.refresh();
      return true;
    } catch (error) {
      setState({ type: "error", message: errorMessage(error, "Unable to save draft.") });
      return false;
    }
  }

  async function publish() {
    const doc = currentDocument(blocks, initialBlocks.version);
    if (!validateDocumentOrShow(doc)) return;

    setState({ type: "saving", message: "Saving and publishing..." });
    try {
      const supabase = createPageServiceClient();
      await updateDraftBlocks(supabase, page.id, doc);
      await publishDraft(supabase, page.id);
      setState({ type: "success", message: "Draft published." });
      router.refresh();
    } catch (error) {
      setState({ type: "error", message: errorMessage(error, "Unable to publish draft.") });
    }
  }

  async function unpublish() {
    if (!page.publishedRevisionId) return;

    setState({ type: "saving", message: "Unpublishing page..." });
    try {
      const supabase = createPageServiceClient();
      await unpublishPage(supabase, page.id);
      setState({ type: "success", message: "Page unpublished. Draft content is still saved." });
      router.refresh();
    } catch (error) {
      setState({ type: "error", message: errorMessage(error, "Unable to unpublish page.") });
    }
  }

  async function restoreRevisionToDraft(revision: PageRevision) {
    setState({ type: "saving", message: "Restoring revision..." });
    try {
      const supabase = createPageServiceClient();
      await restoreRevision(supabase, page.id, revision.id);
      setBlocks(revision.blocks.blocks);
      setSelectedBlockId(revision.blocks.blocks[0]?.id ?? null);
      setBlockErrors({});
      setPreviewRevisionId(revision.id);
      setState({ type: "success", message: "Revision restored to the draft." });
      router.refresh();
    } catch (error) {
      setState({ type: "error", message: errorMessage(error, "Unable to restore revision.") });
    }
  }

  function validateDocumentOrShow(doc: PageBlocksDocument): boolean {
    const result = validatePageBlocksDocument(doc);
    setBlockErrors(result.blockErrors);
    if (!result.ok) {
      setState({ type: "error", message: "Fix validation errors before saving." });
      return false;
    }
    return true;
  }

  return (
    <div className="flex min-h-[calc(100vh-3rem)] flex-col gap-4">
      <header className="flex flex-col gap-3 border-b border-neutral-200 pb-4 dark:border-neutral-800 md:flex-row md:items-center md:justify-between">
        <div>
          <Link
            href={`/admin/${tenantSlug}/pages`}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Back to Pages
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{page.title || page.slug}</h1>
          <p className="text-sm text-muted-foreground">
            Tenant <code>{tenantSlug}</code> - Page <code>/{page.slug}</code>
          </p>
          <PublicationStatusBadge status={publicationStatus} />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={saveDraft}
            disabled={state.type === "saving"}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Save Draft
          </button>
          <button
            type="button"
            onClick={publish}
            disabled={state.type === "saving"}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            Publish
          </button>
          <button
            type="button"
            onClick={unpublish}
            disabled={state.type === "saving" || !page.publishedRevisionId}
            className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-destructive hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-950/30"
          >
            Unpublish
          </button>
        </div>
      </header>

      {state.message && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            state.type === "error"
              ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
              : state.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300"
                : "border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
          }`}
          role={state.type === "error" ? "alert" : "status"}
        >
          {state.message}
        </div>
      )}

      <div className="grid flex-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)_360px]">
        <aside className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Blocks</h2>
          <p className="mt-1 text-xs text-muted-foreground">Add supported content blocks.</p>
          <div className="mt-4 space-y-5">
            {(["content", "data", "media"] as const).map((category) => {
              const descriptors = paletteByCategory.get(category) ?? [];
              if (descriptors.length === 0) return null;
              return (
                <section key={category} aria-labelledby={`palette-${category}`}>
                  <h3 id={`palette-${category}`} className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {category}
                  </h3>
                  <div className="space-y-2">
                    {descriptors.map((descriptor) => (
                      <button
                        key={descriptor.type}
                        type="button"
                        onClick={() => addBlock(descriptor)}
                        className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
                      >
                        <span className="block font-medium">{descriptor.displayName}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{descriptor.description}</span>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </aside>

        <main className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Page Order</h2>
            <span className="text-xs text-muted-foreground">
              {blocks.length} block{blocks.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {blocks.length === 0 && (
              <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-muted-foreground dark:border-neutral-700">
                Add a Hero block to start this draft.
              </div>
            )}
            {blocks.map((block, index) => {
              const descriptor = descriptorsByType.get(block.type);
              const selected = block.id === selectedBlockId;
              const errors = blockErrors[block.id] ?? [];
              return (
                <div
                  key={block.id}
                  onDragOver={(event) => {
                    if (!draggedBlockId || draggedBlockId === block.id) return;
                    event.preventDefault();
                    setDragTargetId(block.id);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    dropBlock(block.id);
                  }}
                  className={`rounded-lg border p-3 ${
                    selected
                      ? "border-neutral-900 bg-neutral-50 dark:border-white dark:bg-neutral-900"
                      : dragTargetId === block.id
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
                        : "border-border"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedBlockId(block.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-sm font-medium">
                        {descriptor?.displayName ?? block.type}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {block.type} - {block.id}
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        draggable
                        aria-label={`Drag ${descriptor?.displayName ?? block.type} to reorder`}
                        title="Drag to reorder"
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", block.id);
                          setDraggedBlockId(block.id);
                          setSelectedBlockId(block.id);
                        }}
                        onDragEnd={() => {
                          setDraggedBlockId(null);
                          setDragTargetId(null);
                        }}
                        className="cursor-grab rounded border border-neutral-200 px-2 py-1 text-xs active:cursor-grabbing dark:border-neutral-700"
                      >
                        Drag
                      </button>
                      <button
                        type="button"
                        onClick={() => moveBlock(block.id, -1)}
                        disabled={index === 0}
                        className="rounded border border-neutral-200 px-2 py-1 text-xs disabled:opacity-40 dark:border-neutral-700"
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        onClick={() => moveBlock(block.id, 1)}
                        disabled={index === blocks.length - 1}
                        className="rounded border border-neutral-200 px-2 py-1 text-xs disabled:opacity-40 dark:border-neutral-700"
                      >
                        Down
                      </button>
                      <button
                        type="button"
                        onClick={() => removeBlock(block.id)}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-destructive hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  {errors.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-destructive">
                      {errors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
          <LivePreviewPanel
            publicSiteBaseUrl={publicSiteBaseUrl}
            tenantSlug={tenantSlug}
            slug={page.slug}
            title={page.title}
            blocks={blocks}
            onSelectBlock={setSelectedBlockId}
          />
        </main>

        <aside className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Properties</h2>
          {!selectedBlock || !selectedDescriptor ? (
            <p className="mt-4 text-sm text-muted-foreground">Select a block to edit its props.</p>
          ) : selectedDescriptor.fields.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              {selectedDescriptor.displayName} is not editable in this vertical slice.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {selectedDescriptor.fields.map((field) => (
                <FieldControl
                  key={field.name}
                  tenantId={tenantId}
                  field={field}
                  value={fieldValue(selectedDescriptor, selectedBlock, field)}
                  errors={fieldErrors(blockErrors[selectedBlock.id] ?? [], field.name)}
                  onChange={(value) => updateSelectedProp(field, value)}
                />
              ))}
            </div>
          )}

          <RevisionHistory
            page={page}
            revisions={initialRevisions}
            previewRevision={previewRevision}
            descriptorsByType={descriptorsByType}
            isBusy={state.type === "saving"}
            onPreview={(revisionId) => setPreviewRevisionId(revisionId)}
            onRestore={restoreRevisionToDraft}
          />
        </aside>
      </div>
    </div>
  );
}

function PublicationStatusBadge({ status }: { status: PublicationStatus }) {
  const toneClass =
    status.tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
      : status.tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
        : "border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300";

  return (
    <div className={`mt-3 inline-flex flex-col rounded-lg border px-3 py-2 text-xs ${toneClass}`}>
      <span className="font-medium">{status.label}</span>
      <span>{status.detail}</span>
    </div>
  );
}

function RevisionHistory({
  page,
  revisions,
  previewRevision,
  descriptorsByType,
  isBusy,
  onPreview,
  onRestore,
}: {
  page: EditorPage;
  revisions: PageRevision[];
  previewRevision: PageRevision | null;
  descriptorsByType: Map<string, EditorBlockDescriptor>;
  isBusy: boolean;
  onPreview: (revisionId: string) => void;
  onRestore: (revision: PageRevision) => void;
}) {
  return (
    <section className="mt-6 border-t border-neutral-200 pt-4 dark:border-neutral-800">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Revision History</h2>
          <p className="mt-1 text-xs text-muted-foreground">Preview and restore older page drafts.</p>
        </div>
        <span className="text-xs text-muted-foreground">{revisions.length}</span>
      </div>

      {revisions.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-neutral-300 p-3 text-xs text-muted-foreground dark:border-neutral-700">
          No revisions yet.
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {revisions.map((revision) => {
            const isPreviewing = previewRevision?.id === revision.id;
            return (
              <div
                key={revision.id}
                className={`rounded-lg border p-3 ${
                  isPreviewing
                    ? "border-neutral-900 bg-neutral-50 dark:border-white dark:bg-neutral-900"
                    : "border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-xs font-medium capitalize">{revision.kind}</span>
                      {revision.id === page.draftRevisionId && <RevisionBadge>Draft</RevisionBadge>}
                      {revision.id === page.publishedRevisionId && (
                        <RevisionBadge>Published</RevisionBadge>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {formatDateTime(revision.createdAt)}
                    </p>
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">{revision.id}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => onPreview(revision.id)}
                      className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => onRestore(revision)}
                      disabled={isBusy}
                      className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
                    >
                      Restore
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {previewRevision && (
        <RevisionPreview revision={previewRevision} descriptorsByType={descriptorsByType} />
      )}
    </section>
  );
}

function RevisionBadge({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
      {children}
    </span>
  );
}

function RevisionPreview({
  revision,
  descriptorsByType,
}: {
  revision: PageRevision;
  descriptorsByType: Map<string, EditorBlockDescriptor>;
}) {
  return (
    <div className="mt-4 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold">Preview</h3>
        <span className="text-xs text-muted-foreground">
          {revision.blocks.blocks.length} block{revision.blocks.blocks.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {revision.blocks.blocks.length === 0 && (
          <p className="text-xs text-muted-foreground">This revision has no blocks.</p>
        )}
        {revision.blocks.blocks.map((block) => {
          const descriptor = descriptorsByType.get(block.type);
          return (
            <details
              key={block.id}
              className="rounded border border-neutral-200 p-2 text-xs dark:border-neutral-800"
            >
              <summary className="cursor-pointer font-medium">
                {descriptor?.displayName ?? block.type}
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded bg-neutral-50 p-2 text-[11px] text-neutral-600 dark:bg-neutral-950 dark:text-neutral-300">
                {JSON.stringify(block.props, null, 2)}
              </pre>
            </details>
          );
        })}
      </div>
    </div>
  );
}

function FieldControl({
  tenantId,
  field,
  value,
  errors,
  onChange,
}: {
  tenantId: string;
  field: BlockField;
  value: unknown;
  errors: string[];
  onChange: (value: unknown) => void;
}) {
  const id = `field-${field.name}`;
  const commonClass =
    "mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700";
  const labelClass = "text-xs font-medium text-muted-foreground";

  return (
    <div>
      {field.type === "statement-list" ? (
        <span className={labelClass}>{field.label}</span>
      ) : (
        <label htmlFor={id} className={labelClass}>
          {field.label}
        </label>
      )}
      {field.type === "textarea" ? (
        <textarea
          id={id}
          value={String(value ?? "")}
          placeholder={field.placeholder}
          rows={4}
          onChange={(event) => onChange(event.target.value)}
          className={commonClass}
        />
      ) : field.type === "boolean" ? (
        <label htmlFor={id} className="mt-2 flex items-center gap-2 text-sm">
          <input
            id={id}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => onChange(event.target.checked)}
          />
          Enabled
        </label>
      ) : field.type === "select" ? (
        <select
          id={id}
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
          className={commonClass}
        >
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : field.type === "string-list" ? (
        <StringListField id={id} field={field} value={value} onChange={onChange} />
      ) : field.type === "statement-list" ? (
        <StatementListField value={value} onChange={onChange} />
      ) : (
        <input
          id={id}
          type={field.type === "number" ? "number" : "text"}
          value={String(value ?? "")}
          placeholder={field.placeholder}
          onChange={(event) =>
            onChange(field.type === "number" ? Number(event.target.value) : event.target.value)
          }
          className={commonClass}
        />
      )}
      {field.helpText && <span className="mt-1 block text-xs text-muted-foreground">{field.helpText}</span>}
      {isMediaField(field) && (
        <AssetPickerField tenantId={tenantId} value={String(value ?? "")} onSelect={onChange} />
      )}
      {errors.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-destructive">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AssetPickerField({
  tenantId,
  value,
  onSelect,
}: {
  tenantId: string;
  value: string;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<TenantAsset[]>([]);
  const [status, setStatus] = useState("");

  async function loadAssets() {
    setOpen((current) => !current);
    if (assets.length > 0) return;
    setStatus("Loading assets...");
    try {
      const result = await listTenantMediaAssets(createStorageClient(), tenantId);
      setAssets(result);
      setStatus("");
    } catch (error) {
      setStatus(errorMessage(error, "Unable to load assets."));
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={loadAssets}
        className="rounded border border-neutral-200 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
      >
        Choose asset
      </button>
      {value && <p className="mt-1 truncate text-[11px] text-muted-foreground">Selected: {value}</p>}
      {open && (
        <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-neutral-200 p-2 dark:border-neutral-800">
          {status && <p className="p-2 text-xs text-muted-foreground">{status}</p>}
          {!status && assets.length === 0 && (
            <p className="p-2 text-xs text-muted-foreground">No uploaded media assets.</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {assets.map((asset) => (
              <button
                key={asset.objectKey}
                type="button"
                onClick={() => {
                  onSelect(asset.url);
                  setOpen(false);
                }}
                className="overflow-hidden rounded border border-neutral-200 text-left text-xs hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
              >
                <img src={asset.url} alt="" className="aspect-video w-full object-cover" />
                <span className="block truncate px-2 py-1">{asset.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StringListField({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: BlockField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const items = asStringArray(value);

  if (field.options?.length) {
    return (
      <div id={id} className="mt-2 space-y-2">
        {field.options.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={items.includes(option.value)}
              onChange={(event) =>
                onChange(toggleStringListItem(items, option.value, event.target.checked))
              }
            />
            {option.label}
          </label>
        ))}
      </div>
    );
  }

  return (
    <textarea
      id={id}
      value={items.join("\n")}
      placeholder={field.placeholder ?? "One item per line"}
      rows={4}
      onChange={(event) =>
        onChange(
          event.target.value
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean)
        )
      }
      className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
    />
  );
}

function StatementListField({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const items = asStatementItems(value);

  function updateItem(index: number, key: keyof StatementItem, nextValue: string) {
    onChange(
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: nextValue } : item
      )
    );
  }

  function removeItem(index: number) {
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="mt-2 space-y-3">
      {items.length === 0 && (
        <div className="rounded-lg border border-dashed border-neutral-300 p-3 text-xs text-muted-foreground dark:border-neutral-700">
          No statements yet.
        </div>
      )}
      {items.map((item, index) => (
        <div key={index} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">Statement {index + 1}</span>
            <button
              type="button"
              onClick={() => removeItem(index)}
              className="rounded border border-red-200 px-2 py-1 text-xs text-destructive hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30"
            >
              Remove
            </button>
          </div>
          <label className="mt-3 block text-xs font-medium text-muted-foreground">
            Label
            <input
              type="text"
              value={item.label}
              onChange={(event) => updateItem(index, "label", event.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
            />
          </label>
          <label className="mt-3 block text-xs font-medium text-muted-foreground">
            Body
            <textarea
              value={item.body}
              rows={3}
              onChange={(event) => updateItem(index, "body", event.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
            />
          </label>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, { label: "", body: "" }])}
        className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
      >
        Add statement
      </button>
    </div>
  );
}

type StatementItem = {
  label: string;
  body: string;
};

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return [];
}

function asStatementItems(value: unknown): StatementItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
    .map((item) => ({
      label: typeof item.label === "string" ? item.label : "",
      body: typeof item.body === "string" ? item.body : "",
    }));
}

function toggleStringListItem(items: string[], value: string, checked: boolean): string[] {
  if (checked) return items.includes(value) ? items : [...items, value];
  return items.filter((item) => item !== value);
}

function isMediaField(field: BlockField): boolean {
  return field.name === "mediaUrl" || field.name === "mediaKey" || field.name === "backgroundImageKey";
}

function currentDocument(blocks: PageBlock[], version: number): PageBlocksDocument {
  return { version: version || 1, blocks };
}

function describePublicationStatus(
  draft: PageBlocksDocument,
  publishedRevision: PageRevision | null
): PublicationStatus {
  if (!publishedRevision) {
    return {
      tone: "neutral",
      label: "Unpublished",
      detail: `${draft.blocks.length} draft block${draft.blocks.length === 1 ? "" : "s"}; no published revision.`,
    };
  }

  const matchesPublished = stableStringify(draft) === stableStringify(publishedRevision.blocks);
  if (matchesPublished) {
    return {
      tone: "success",
      label: "Published matches draft",
      detail: `${draft.blocks.length} block${draft.blocks.length === 1 ? "" : "s"} live.`,
    };
  }

  return {
    tone: "warning",
    label: "Draft differs from published",
    detail: `Draft has ${draft.blocks.length}; published has ${publishedRevision.blocks.blocks.length}.`,
  };
}

function fieldValue(
  descriptor: EditorBlockDescriptor,
  block: PageBlock,
  field: BlockField
): unknown {
  return block.props[field.name] ?? descriptor.defaultProps[field.name] ?? "";
}

function fieldErrors(errors: string[], fieldName: string): string[] {
  return errors.filter((error) => error === fieldName || error.startsWith(`${fieldName}:`));
}

function cloneProps(props: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(props)) as Record<string, unknown>;
}

function createBlockId(type: string): string {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${type}-${suffix}`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      result[key] = sortJson((value as Record<string, unknown>)[key]);
      return result;
    }, {});
}

function createPageServiceClient(): Parameters<typeof updateDraftBlocks>[0] {
  return createSupabaseBrowserClient() as unknown as Parameters<typeof updateDraftBlocks>[0];
}

function createStorageClient(): SupabaseClient<Database> {
  return createSupabaseBrowserClient() as unknown as SupabaseClient<Database>;
}
