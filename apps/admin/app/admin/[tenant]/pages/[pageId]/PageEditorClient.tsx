"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { publishDraft, updateDraftBlocks } from "@lume/db";
import type { PageBlock, PageBlocksDocument } from "@lume/types";
import type { BlockField, EditorBlockDescriptor } from "@lume/blocks";
import { validatePageBlocksDocument } from "@lume/blocks";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type EditorPage = {
  id: string;
  slug: string;
  title: string;
};

type SaveState =
  | { type: "idle"; message: string }
  | { type: "saving"; message: string }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

type PageEditorClientProps = {
  tenantId: string;
  tenantSlug: string;
  page: EditorPage;
  initialBlocks: PageBlocksDocument;
  blockDescriptors: EditorBlockDescriptor[];
};

export default function PageEditorClient({
  tenantId,
  tenantSlug,
  page,
  initialBlocks,
  blockDescriptors,
}: PageEditorClientProps) {
  const router = useRouter();
  const [blocks, setBlocks] = useState<PageBlock[]>(initialBlocks.blocks);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(
    initialBlocks.blocks[0]?.id ?? null
  );
  const [state, setState] = useState<SaveState>({ type: "idle", message: "" });
  const [blockErrors, setBlockErrors] = useState<Record<string, string[]>>({});

  const descriptorsByType = useMemo(
    () => new Map(blockDescriptors.map((descriptor) => [descriptor.type, descriptor])),
    [blockDescriptors]
  );
  const paletteDescriptors = useMemo(
    () => blockDescriptors.filter((descriptor) => descriptor.palette),
    [blockDescriptors]
  );
  const selectedBlock = blocks.find((block) => block.id === selectedBlockId) ?? null;
  const selectedDescriptor = selectedBlock ? descriptorsByType.get(selectedBlock.type) : null;

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
            className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
          >
            Back to Pages
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{page.title || page.slug}</h1>
          <p className="text-sm text-neutral-500">
            Tenant <code>{tenantSlug}</code> - Page <code>/{page.slug}</code>
          </p>
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
          <p className="mt-1 text-xs text-neutral-500">Add supported content blocks.</p>
          <div className="mt-4 space-y-2">
            {paletteDescriptors.map((descriptor) => (
              <button
                key={descriptor.type}
                type="button"
                onClick={() => addBlock(descriptor)}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
              >
                <span className="block font-medium">{descriptor.displayName}</span>
                <span className="mt-0.5 block text-xs text-neutral-500">{descriptor.description}</span>
              </button>
            ))}
          </div>
        </aside>

        <main className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Page Order</h2>
            <span className="text-xs text-neutral-500">
              {blocks.length} block{blocks.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {blocks.length === 0 && (
              <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
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
                  className={`rounded-lg border p-3 ${
                    selected
                      ? "border-neutral-900 bg-neutral-50 dark:border-white dark:bg-neutral-900"
                      : "border-neutral-200 dark:border-neutral-800"
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
                      <span className="block truncate text-xs text-neutral-500">
                        {block.type} - {block.id}
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
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
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  {errors.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-red-600">
                      {errors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </main>

        <aside className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Properties</h2>
          {!selectedBlock || !selectedDescriptor ? (
            <p className="mt-4 text-sm text-neutral-500">Select a block to edit its props.</p>
          ) : selectedDescriptor.fields.length === 0 ? (
            <p className="mt-4 text-sm text-neutral-500">
              {selectedDescriptor.displayName} is not editable in this vertical slice.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {selectedDescriptor.fields.map((field) => (
                <FieldControl
                  key={field.name}
                  field={field}
                  value={fieldValue(selectedDescriptor, selectedBlock, field)}
                  errors={fieldErrors(blockErrors[selectedBlock.id] ?? [], field.name)}
                  onChange={(value) => updateSelectedProp(field, value)}
                />
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function FieldControl({
  field,
  value,
  errors,
  onChange,
}: {
  field: BlockField;
  value: unknown;
  errors: string[];
  onChange: (value: unknown) => void;
}) {
  const id = `field-${field.name}`;
  const commonClass =
    "mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700";
  const labelClass = "text-xs font-medium text-neutral-500";

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
      {field.helpText && <span className="mt-1 block text-xs text-neutral-500">{field.helpText}</span>}
      {errors.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-red-600">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
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
        <div className="rounded-lg border border-dashed border-neutral-300 p-3 text-xs text-neutral-500 dark:border-neutral-700">
          No statements yet.
        </div>
      )}
      {items.map((item, index) => (
        <div key={index} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-neutral-500">Statement {index + 1}</span>
            <button
              type="button"
              onClick={() => removeItem(index)}
              className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30"
            >
              Remove
            </button>
          </div>
          <label className="mt-3 block text-xs font-medium text-neutral-500">
            Label
            <input
              type="text"
              value={item.label}
              onChange={(event) => updateItem(index, "label", event.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
            />
          </label>
          <label className="mt-3 block text-xs font-medium text-neutral-500">
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

function currentDocument(blocks: PageBlock[], version: number): PageBlocksDocument {
  return { version: version || 1, blocks };
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

function createPageServiceClient(): Parameters<typeof updateDraftBlocks>[0] {
  return createSupabaseBrowserClient() as unknown as Parameters<typeof updateDraftBlocks>[0];
}
