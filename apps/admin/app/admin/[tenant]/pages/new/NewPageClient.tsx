"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createPage, normalizePageSlug, validateNewPageSlug } from "@lume/db";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type NewPageClientProps = {
  tenantId: string;
  tenantSlug: string;
  existingSlugs: string[];
  navOrder: number;
};

export default function NewPageClient({
  tenantId,
  tenantSlug,
  existingSlugs,
  navOrder,
}: NewPageClientProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [status, setStatus] = useState<{ type: "idle" | "saving" | "error"; message: string }>({
    type: "idle",
    message: "",
  });
  const validation = useMemo(
    () => validateNewPageSlug(slug, existingSlugs),
    [existingSlugs, slug]
  );

  function handleTitleChange(value: string) {
    setTitle(value);
    if (!slugTouched) setSlug(normalizePageSlug(value));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const latestValidation = validateNewPageSlug(slug, existingSlugs);
    if (!latestValidation.ok) {
      setStatus({ type: "error", message: latestValidation.reason });
      return;
    }

    setStatus({ type: "saving", message: "Creating page..." });
    try {
      const supabase = createPageServiceClient();
      const page = await createPage(supabase, {
        tenantId,
        slug: latestValidation.slug,
        title: title.trim() || titleFromSlug(latestValidation.slug),
        navOrder,
      });
      router.push(`/admin/${tenantSlug}/pages/${page.id}`);
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to create page.",
      });
    }
  }

  return (
    <form className="max-w-xl space-y-6" onSubmit={handleSubmit}>
      <div>
        <Link
          href={`/admin/${tenantSlug}/pages`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Back to Pages
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">New Page</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a custom tenant page. Reserved system routes are blocked.
        </p>
      </div>

      <label className="block">
        <span className="text-sm font-medium">Title</span>
        <input
          value={title}
          onChange={(event) => handleTitleChange(event.target.value)}
          className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          placeholder="Fall Launch"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Slug</span>
        <div className="mt-1 flex rounded-lg border border-input">
          <span className="border-r border-neutral-300 px-3 py-2 text-sm text-muted-foreground dark:border-neutral-700">
            /
          </span>
          <input
            value={slug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(normalizePageSlug(event.target.value));
            }}
            className="w-full rounded-r-lg bg-transparent px-3 py-2 text-sm outline-none"
            placeholder="fall-launch"
          />
        </div>
        <span
          className={`mt-1 block text-xs ${
            validation.ok ? "text-muted-foreground" : "text-destructive"
          }`}
        >
          {validation.ok ? "Lowercase URL slug for this page." : validation.reason}
        </span>
      </label>

      {status.message && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
          role="alert"
        >
          {status.message}
        </div>
      )}

      <button
        type="submit"
        disabled={status.type === "saving" || !validation.ok}
        className="rounded-md bg-neutral-950 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
      >
        {status.type === "saving" ? "Creating..." : "Create Page"}
      </button>
    </form>
  );
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function createPageServiceClient(): Parameters<typeof createPage>[0] {
  return createSupabaseBrowserClient() as unknown as Parameters<typeof createPage>[0];
}
