"use client";

import { validateBlock, type EditorBlockDescriptor } from "@lume/blocks";
import type { PageBlock } from "@lume/types";

type DraftPreviewPanelProps = {
  pageSlug: string;
  pageTitle: string;
  blocks: PageBlock[];
  blockDescriptors: EditorBlockDescriptor[];
};

/** Admin-only live preview. It renders the authenticated editor's draft state
 * directly, so unpublished draft content never needs an anon-readable endpoint. */
export function DraftPreviewPanel({
  pageSlug,
  pageTitle,
  blocks,
  blockDescriptors,
}: DraftPreviewPanelProps) {
  const descriptorsByType = new Map(blockDescriptors.map((descriptor) => [descriptor.type, descriptor]));

  return (
    <section className="mt-6 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold">Live Draft Preview</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Admin-only preview of the current unsaved editor state.
          </p>
        </div>
        <span className="rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
          /{pageSlug}
        </span>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950 text-white">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-xs text-white/60">
          <span>{pageTitle || pageSlug}</span>
          <span>
            {blocks.length} block{blocks.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="min-h-80 space-y-4 bg-[radial-gradient(circle_at_top,rgba(245,207,122,0.12),transparent_36%),#070708] p-4">
          {blocks.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/15 p-8 text-center text-sm text-white/50">
              Add blocks to preview this draft.
            </div>
          ) : (
            blocks.map((block) => (
              <PreviewBlock
                key={block.id}
                block={block}
                label={descriptorsByType.get(block.type)?.displayName ?? block.type}
              />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function PreviewBlock({ block, label }: { block: PageBlock; label: string }) {
  const validation = validateBlock(block);
  if (!validation.ok) {
    return (
      <section className="rounded-lg border border-red-400/50 bg-red-950/30 p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-red-200">{label}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-red-100">
          {validation.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      </section>
    );
  }

  switch (block.type) {
    case "hero":
      return <HeroPreview props={block.props} />;
    case "feature-band":
      return <FeatureBandPreview props={block.props} />;
    case "statement-list":
      return <StatementListPreview props={block.props} />;
    case "rich-text":
      return <RichTextPreview props={block.props} />;
    case "product-grid":
      return <ProductGridPreview props={block.props} />;
    case "vehicle-inventory":
      return <VehicleInventoryPreview props={block.props} />;
    case "showcase-gallery":
      return <ShowcaseGalleryPreview props={block.props} />;
    default:
      return (
        <section className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-white/60">{label}</p>
          <p className="mt-2 text-sm text-white/70">No preview renderer is registered for this block.</p>
        </section>
      );
  }
}

function HeroPreview({ props }: { props: Record<string, unknown> }) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.04] p-6">
      <p className="text-xs font-medium uppercase tracking-[0.24em] text-amber-200">
        {textProp(props, "eyebrow", "Hero")}
      </p>
      <h1 className="mt-3 max-w-2xl text-3xl font-semibold">{textProp(props, "title")}</h1>
      {textProp(props, "subtitle") && (
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">{textProp(props, "subtitle")}</p>
      )}
      <PreviewCtas props={props} />
      {textProp(props, "mediaUrl") && (
        <img
          src={textProp(props, "mediaUrl")}
          alt=""
          className="mt-5 max-h-56 w-full rounded-lg object-cover"
        />
      )}
      {textProp(props, "backgroundImageKey") && (
        <p className="mt-3 text-xs text-white/50">Background: {textProp(props, "backgroundImageKey")}</p>
      )}
    </section>
  );
}

function FeatureBandPreview({ props }: { props: Record<string, unknown> }) {
  return (
    <section className="grid gap-4 rounded-lg border border-white/10 bg-white/[0.03] p-5 md:grid-cols-[1.2fr_0.8fr]">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-amber-200">{textProp(props, "kicker")}</p>
        <h2 className="mt-2 text-2xl font-semibold">{textProp(props, "heading")}</h2>
        <p className="mt-3 text-sm leading-6 text-white/70">{textProp(props, "body")}</p>
      </div>
      <div className="rounded-lg border border-white/10 bg-black/30 p-4 text-xs text-white/50">
        {textProp(props, "mediaKey", "No media key")}
      </div>
    </section>
  );
}

function StatementListPreview({ props }: { props: Record<string, unknown> }) {
  const items = statementItemsProp(props, "items");
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
      <div className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-white/50">No statements configured.</p>
        ) : (
          items.map((item, index) => (
            <div key={`${item.label}-${index}`} className="grid gap-2 border-t border-white/10 pt-3 first:border-t-0 first:pt-0 md:grid-cols-[80px_1fr]">
              <span className="text-xs font-medium text-amber-200">{item.label || `0${index + 1}`}</span>
              <p className="text-sm leading-6 text-white/75">{item.body}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function RichTextPreview({ props }: { props: Record<string, unknown> }) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
      <p className="whitespace-pre-wrap text-sm leading-7 text-white/75">{textProp(props, "body")}</p>
    </section>
  );
}

function ProductGridPreview({ props }: { props: Record<string, unknown> }) {
  const categories = stringListProp(props, "categories");
  return (
    <DataBlockPreview
      eyebrow="Product grid"
      title={textProp(props, "title", "Products")}
      subtitle={textProp(props, "subtitle")}
      chips={categories.length ? categories : ["All categories"]}
    />
  );
}

function VehicleInventoryPreview({ props }: { props: Record<string, unknown> }) {
  return (
    <DataBlockPreview
      eyebrow="Vehicle inventory"
      title={textProp(props, "title", "Vehicles")}
      subtitle={booleanProp(props, "showFilters", true) ? "Filters enabled" : "Filters hidden"}
      chips={["Live inventory source"]}
    />
  );
}

function ShowcaseGalleryPreview({ props }: { props: Record<string, unknown> }) {
  const chapterIds = stringListProp(props, "chapterIds");
  return (
    <DataBlockPreview
      eyebrow="Showcase gallery"
      title={textProp(props, "title", "Showcase")}
      subtitle="Chapter cards"
      chips={chapterIds.length ? chapterIds : ["All seeded chapters"]}
    />
  );
}

function DataBlockPreview({
  eyebrow,
  title,
  subtitle,
  chips,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  chips: string[];
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
      <p className="text-xs uppercase tracking-[0.2em] text-amber-200">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold">{title}</h2>
      {subtitle && <p className="mt-2 text-sm text-white/65">{subtitle}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <span key={chip} className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/60">
            {chip}
          </span>
        ))}
      </div>
    </section>
  );
}

function PreviewCtas({ props }: { props: Record<string, unknown> }) {
  const primary = textProp(props, "primaryCtaLabel");
  const secondary = textProp(props, "secondaryCtaLabel");
  if (!primary && !secondary) return null;

  return (
    <div className="mt-5 flex flex-wrap gap-2">
      {primary && (
        <span className="rounded-full bg-white px-4 py-2 text-xs font-medium text-black">{primary}</span>
      )}
      {secondary && (
        <span className="rounded-full border border-white/20 px-4 py-2 text-xs font-medium text-white">
          {secondary}
        </span>
      )}
    </div>
  );
}

function textProp(props: Record<string, unknown>, key: string, fallback = ""): string {
  const value = props[key];
  return typeof value === "string" ? value : fallback;
}

function booleanProp(props: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = props[key];
  return typeof value === "boolean" ? value : fallback;
}

function stringListProp(props: Record<string, unknown>, key: string): string[] {
  const value = props[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function statementItemsProp(
  props: Record<string, unknown>,
  key: string
): Array<{ label: string; body: string }> {
  const value = props[key];
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
    .map((item) => ({
      label: typeof item.label === "string" ? item.label : "",
      body: typeof item.body === "string" ? item.body : "",
    }));
}
